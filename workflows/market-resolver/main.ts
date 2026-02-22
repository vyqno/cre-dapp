import {
	bytesToHex,
	handler,
	EVMClient,
	type EVMLog,
	encodeCallMsg,
	getNetwork,
	hexToBase64,
	LAST_FINALIZED_BLOCK_NUMBER,
	Runner,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import { z } from 'zod'
import { PredictionMarketABI } from '../contracts/abi'

// --- Config Schema ---
const configSchema = z.object({
	predictionMarketAddress: z.string(),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

// --- EVM helper ---
const getEvmClient = (runtime: Runtime<Config>): EVMClient => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})
	if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
	return new EVMClient(network.chainSelector.selector)
}

// --- Read market details ---
const readMarket = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	marketId: bigint,
): {
	agentId: bigint
	metric: number
	comparison: number
	threshold: bigint
	deadline: bigint
	status: number
	totalYes: bigint
	totalNo: bigint
} => {
	const callData = encodeFunctionData({
		abi: PredictionMarketABI,
		functionName: 'getMarket',
		args: [marketId],
	})
	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.predictionMarketAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const market = decodeFunctionResult({
		abi: PredictionMarketABI,
		functionName: 'getMarket',
		data: bytesToHex(result.data),
	}) as any

	return {
		agentId: market.agentId ?? market[0],
		metric: Number(market.metric ?? market[1]),
		comparison: Number(market.comparison ?? market[2]),
		threshold: market.threshold ?? market[3],
		deadline: market.deadline ?? market[4],
		status: Number(market.status ?? market[6]),
		totalYes: market.totalYes ?? market[7],
		totalNo: market.totalNo ?? market[8],
	}
}

// --- Resolve market via DON consensus ---
const resolveMarket = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	marketId: bigint,
): string => {
	const callData = encodeFunctionData({
		abi: PredictionMarketABI,
		functionName: 'resolve',
		args: [marketId],
	})

	runtime.log(`Resolving market ${marketId} via DON consensus...`)

	const reportResponse = runtime
		.report({
			encodedPayload: hexToBase64(callData),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.predictionMarketAddress,
			report: reportResponse,
			gasConfig: { gasLimit: runtime.config.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to resolve market ${marketId}: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	return bytesToHex(txHash)
}

// --- Log trigger handler: fires when MarketExpired event is emitted ---
const onMarketExpired = (runtime: Runtime<Config>, payload: EVMLog): string => {
	runtime.log(`Market Resolver triggered at ${new Date().toISOString()}`)

	// Extract marketId from the log trigger payload
	// MarketExpired(uint256 indexed marketId) — marketId is topic[1]
	const topics = payload.topics

	if (topics.length < 2) {
		throw new Error(`MarketExpired event missing marketId topic (got ${topics.length} topics)`)
	}

	// topic[1] is the indexed marketId as 32-byte Uint8Array
	const marketIdHex = bytesToHex(topics[1])
	const marketId = BigInt(marketIdHex)
	runtime.log(`MarketExpired event for marketId: ${marketId}`)

	const evmClient = getEvmClient(runtime)

	// Step 1: Read market details to verify it's still OPEN (status=0)
	const market = readMarket(runtime, evmClient, marketId)
	runtime.log(`Market ${marketId}: agentId=${market.agentId}, metric=${market.metric}, status=${market.status}`)

	if (market.status !== 0) {
		runtime.log(`Market ${marketId} is no longer OPEN (status=${market.status}), skipping`)
		return `skipped:${marketId}:already-resolved`
	}

	// Step 2: Resolve the market via DON consensus
	// The resolve() function on PredictionMarket.sol reads AgentMetrics internally
	// and determines YES/NO outcome based on threshold + comparison
	const txHash = resolveMarket(runtime, evmClient, marketId)
	runtime.log(`Market ${marketId} resolved at tx: ${txHash}`)

	return `resolved:${marketId}:${txHash}`
}

// --- Workflow initialization ---
const initWorkflow = (config: Config) => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: config.chainSelectorName,
		isTestnet: true,
	})
	if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

	const evmClient = new EVMClient(network.chainSelector.selector)

	return [
		handler(
			evmClient.logTrigger({
				addresses: [config.predictionMarketAddress],
			}),
			onMarketExpired,
		),
	]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}

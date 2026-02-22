import {
	bytesToHex,
	type CronPayload,
	handler,
	CronCapability,
	EVMClient,
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
import { AgentRegistryABI } from '../contracts/abi'

// --- Config Schema ---
const configSchema = z.object({
	schedule: z.string(),
	agentRegistryAddress: z.string(),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
	agentIds: z.array(z.number()),
	tenderlyAccount: z.string(),
	tenderlyProject: z.string(),
	tenderlyAccessKey: z.string(),
	inactivityThresholdHours: z.number().default(24),
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

// --- Read agent wallet from AgentRegistry ---
const readAgentInfo = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): { wallet: Address; isActive: boolean } => {
	const callData = encodeFunctionData({
		abi: AgentRegistryABI,
		functionName: 'getAgent',
		args: [BigInt(agentId)],
	})
	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.agentRegistryAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const agent = decodeFunctionResult({
		abi: AgentRegistryABI,
		functionName: 'getAgent',
		data: bytesToHex(result.data),
	}) as any

	return {
		wallet: (agent.wallet ?? agent[1] ?? zeroAddress) as Address,
		isActive: agent.isActive ?? agent[7] ?? false,
	}
}

// --- Fetch last transaction timestamp from Tenderly ---
const fetchLastActivity = async (
	runtime: Runtime<Config>,
	agentWallet: Address,
): Promise<number | null> => {
	runtime.log(`Checking Tenderly activity for wallet: ${agentWallet}`)

	const url = `https://api.tenderly.co/api/v1/account/${runtime.config.tenderlyAccount}/project/${runtime.config.tenderlyProject}/transactions?wallet=${agentWallet}&limit=1&sort=timestamp&order=desc`

	const res = await runtime.fetch(url, {
		headers: { 'X-Access-Key': runtime.config.tenderlyAccessKey },
	})
	const data = await res.json()
	const txs = (data as any).transactions ?? []

	if (txs.length === 0) {
		runtime.log(`No transactions found for wallet ${agentWallet}`)
		return null
	}

	// Tenderly returns timestamp as ISO string or unix timestamp
	const lastTx = txs[0]
	const timestamp = lastTx.timestamp
		? new Date(lastTx.timestamp).getTime() / 1000
		: lastTx.block_timestamp ?? 0

	runtime.log(`Last tx timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`)
	return timestamp
}

// --- Deactivate agent via DON consensus ---
const deactivateAgent = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): string => {
	const callData = encodeFunctionData({
		abi: AgentRegistryABI,
		functionName: 'deactivateAgent',
		args: [BigInt(agentId)],
	})

	runtime.log(`Deactivating agent ${agentId} via DON consensus...`)

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
			receiver: runtime.config.agentRegistryAddress,
			report: reportResponse,
			gasConfig: { gasLimit: runtime.config.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		// Non-fatal: deactivateAgent requires msg.sender == creator
		// In production, the CRE workflow address would be set as creator
		runtime.log(`Warning: deactivation failed for agent ${agentId}: ${resp.errorMessage || resp.txStatus}`)
		return 'failed'
	}

	const txHash = resp.txHash || new Uint8Array(32)
	return bytesToHex(txHash)
}

// --- Main handler ---
const onCronTrigger = async (runtime: Runtime<Config>, payload: CronPayload): Promise<string> => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	runtime.log(`Health Monitor running at ${new Date().toISOString()}`)
	runtime.log(`Checking agents: ${runtime.config.agentIds.join(', ')}`)

	const evmClient = getEvmClient(runtime)
	const nowSec = Math.floor(Date.now() / 1000)
	const thresholdSec = runtime.config.inactivityThresholdHours * 3600
	const results: string[] = []

	for (const agentId of runtime.config.agentIds) {
		runtime.log(`--- Checking agent ${agentId} ---`)

		// Step 1: Read agent info from registry
		const agentInfo = readAgentInfo(runtime, evmClient, agentId)
		if (agentInfo.wallet === zeroAddress) {
			runtime.log(`Agent ${agentId} has no wallet, skipping`)
			results.push(`no-wallet:${agentId}`)
			continue
		}
		if (!agentInfo.isActive) {
			runtime.log(`Agent ${agentId} already inactive, skipping`)
			results.push(`already-inactive:${agentId}`)
			continue
		}

		// Step 2: Check last activity via Tenderly API
		const lastActivityTs = await fetchLastActivity(runtime, agentInfo.wallet)

		if (lastActivityTs === null) {
			// Never transacted — could be newly deployed, give benefit of doubt
			runtime.log(`Agent ${agentId} has no tx history, monitoring...`)
			results.push(`no-history:${agentId}`)
			continue
		}

		const inactiveSec = nowSec - lastActivityTs
		const inactiveHours = Math.round(inactiveSec / 3600)
		runtime.log(`Agent ${agentId}: last active ${inactiveHours}h ago`)

		if (inactiveSec < thresholdSec) {
			runtime.log(`Agent ${agentId} is active (within ${runtime.config.inactivityThresholdHours}h threshold)`)
			results.push(`active:${agentId}`)
			continue
		}

		// Step 3: Agent is inactive — deactivate via DON consensus
		runtime.log(`Agent ${agentId} inactive for ${inactiveHours}h (threshold: ${runtime.config.inactivityThresholdHours}h) — deactivating`)
		const txResult = deactivateAgent(runtime, evmClient, agentId)
		results.push(`deactivated:${agentId}:${txResult}`)
	}

	runtime.log(`Health Monitor complete: ${results.join(', ')}`)
	return results.join(',')
}

// --- Workflow initialization ---
const initWorkflow = (config: Config) => {
	const cronTrigger = new CronCapability()
	return [
		handler(
			cronTrigger.trigger({ schedule: config.schedule }),
			onCronTrigger,
		),
	]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}

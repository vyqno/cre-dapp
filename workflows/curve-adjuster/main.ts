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
import { AgentMetricsABI, AgentBondingCurveABI, BondingCurveFactoryABI } from '../contracts/abi'

// --- Config Schema ---
const configSchema = z.object({
	schedule: z.string(),
	agentMetricsAddress: z.string(),
	bondingCurveFactoryAddress: z.string(),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
	agentIds: z.array(z.number()),
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

// --- Get bonding curve address for an agent from factory ---
const getCurveAddress = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): Address => {
	const callData = encodeFunctionData({
		abi: BondingCurveFactoryABI,
		functionName: 'getCurve',
		args: [BigInt(agentId)],
	})
	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.bondingCurveFactoryAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	return decodeFunctionResult({
		abi: BondingCurveFactoryABI,
		functionName: 'getCurve',
		data: bytesToHex(result.data),
	}) as Address
}

// --- Read current metrics from AgentMetrics ---
const readMetrics = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): { roiBps: bigint; winRateBps: bigint } => {
	const callData = encodeFunctionData({
		abi: AgentMetricsABI,
		functionName: 'getMetrics',
		args: [BigInt(agentId)],
	})
	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.agentMetricsAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const metrics = decodeFunctionResult({
		abi: AgentMetricsABI,
		functionName: 'getMetrics',
		data: bytesToHex(result.data),
	}) as any
	return {
		roiBps: metrics.roiBps,
		winRateBps: metrics.winRateBps,
	}
}

// --- Read current slope from bonding curve ---
const readCurrentSlope = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	curveAddress: Address,
): bigint => {
	const callData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'slope',
	})
	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: curveAddress, data: callData }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	return decodeFunctionResult({
		abi: AgentBondingCurveABI,
		functionName: 'slope',
		data: bytesToHex(result.data),
	}) as bigint
}

// --- Compute new slope based on agent performance ---
// Better ROI → steeper slope → faster price appreciation
// Lower ROI → flatter slope → price grows slower
const computeNewSlope = (currentSlope: bigint, roiBps: number, winRateBps: number): bigint => {
	// Score: 0-200 (100 = neutral)
	const score = Math.max(0, Math.min(200,
		(roiBps / 10000) * 50 +   // ROI contributes 50% (max 50 pts at 100% ROI)
		(winRateBps / 10000) * 50  // win rate contributes 50% (max 50 pts at 100% win rate)
	))

	// new_slope = current_slope × (0.5 + score/200)
	// Score 200 → slope × 1.5 (50% steeper)
	// Score 100 → slope × 1.0 (unchanged)
	// Score 0   → slope × 0.5 (50% flatter)
	const multiplier = BigInt(Math.round((0.5 + score / 200) * 1000))
	const newSlope = (currentSlope * multiplier) / 1000n

	// Ensure minimum slope (never go to zero)
	const MIN_SLOPE = 1000000000000n // 0.000001 ether
	return newSlope > MIN_SLOPE ? newSlope : MIN_SLOPE
}

// --- Write new slope via DON consensus ---
const writeNewSlope = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	curveAddress: Address,
	newSlope: bigint,
): string => {
	const callData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'adjustSlope',
		args: [newSlope],
	})

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
			receiver: curveAddress,
			report: reportResponse,
			gasConfig: { gasLimit: runtime.config.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to adjust slope: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	return bytesToHex(txHash)
}

// --- Main handler ---
const onCronTrigger = async (runtime: Runtime<Config>, payload: CronPayload): Promise<string> => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	runtime.log(`Curve Adjuster running at ${new Date().toISOString()}`)
	runtime.log(`Processing agents: ${runtime.config.agentIds.join(', ')}`)

	const evmClient = getEvmClient(runtime)
	const results: string[] = []

	for (const agentId of runtime.config.agentIds) {
		runtime.log(`--- Adjusting curve for agent ${agentId} ---`)

		// Step 1: Get bonding curve address
		const curveAddress = getCurveAddress(runtime, evmClient, agentId)
		if (curveAddress === zeroAddress) {
			runtime.log(`No curve found for agent ${agentId}, skipping`)
			results.push(`skipped:${agentId}`)
			continue
		}

		// Step 2: Read current metrics from AgentMetrics
		const metrics = readMetrics(runtime, evmClient, agentId)
		const roiBps = Number(metrics.roiBps)
		const winRateBps = Number(metrics.winRateBps)
		runtime.log(`Metrics: ROI=${roiBps}bps, winRate=${winRateBps}bps`)

		// Step 3: Read current slope
		const currentSlope = readCurrentSlope(runtime, evmClient, curveAddress)
		runtime.log(`Current slope: ${currentSlope}`)

		// Step 4: Compute new slope
		const newSlope = computeNewSlope(currentSlope, roiBps, winRateBps)
		runtime.log(`Computed new slope: ${newSlope}`)

		// Step 5: Skip if slope hasn't changed
		if (newSlope === currentSlope) {
			runtime.log(`Slope unchanged for agent ${agentId}, skipping`)
			results.push(`no-change:${agentId}`)
			continue
		}

		// Step 6: Write new slope via DON consensus
		const txHash = writeNewSlope(runtime, evmClient, curveAddress, newSlope)
		runtime.log(`Slope adjusted for agent ${agentId}: ${currentSlope} → ${newSlope} (tx: ${txHash})`)
		results.push(`adjusted:${agentId}:${txHash}`)
	}

	runtime.log(`Curve Adjuster complete: ${results.join(', ')}`)
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

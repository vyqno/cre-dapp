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

// --- On-chain state types ---
interface CurveState {
	totalSupply: bigint
	reserveBalance: bigint
	currentPrice: bigint
	slope: bigint
}

interface OnChainMetrics {
	roiBps: bigint
	winRateBps: bigint
	maxDrawdownBps: bigint
	sharpeRatioScaled: bigint
	tvlManaged: bigint
	totalTrades: bigint
	lastUpdated: bigint
}

interface ComputedMetrics {
	agentId: number
	roiBps: number
	winRateBps: number
	maxDrawdownBps: number
	sharpeRatioScaled: number
	tvlManaged: number
	totalTrades: number
}

// --- EVM helper: create client for configured chain ---
const getEvmClient = (runtime: Runtime<Config>): EVMClient => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
	}

	return new EVMClient(network.chainSelector.selector)
}

// --- Read bonding curve state for an agent ---
const readCurveState = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	curveAddress: Address,
): CurveState => {
	// Read totalSupply
	const supplyData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'totalSupply',
	})
	const supplyResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: curveAddress, data: supplyData }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const totalSupply = decodeFunctionResult({
		abi: AgentBondingCurveABI,
		functionName: 'totalSupply',
		data: bytesToHex(supplyResult.data),
	})

	// Read reserveBalance
	const reserveData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'reserveBalance',
	})
	const reserveResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: curveAddress, data: reserveData }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const reserveBalance = decodeFunctionResult({
		abi: AgentBondingCurveABI,
		functionName: 'reserveBalance',
		data: bytesToHex(reserveResult.data),
	})

	// Read currentPrice
	const priceData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'currentPrice',
	})
	const priceResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: curveAddress, data: priceData }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const currentPrice = decodeFunctionResult({
		abi: AgentBondingCurveABI,
		functionName: 'currentPrice',
		data: bytesToHex(priceResult.data),
	})

	// Read slope
	const slopeData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'slope',
	})
	const slopeResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: curveAddress, data: slopeData }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const slope = decodeFunctionResult({
		abi: AgentBondingCurveABI,
		functionName: 'slope',
		data: bytesToHex(slopeResult.data),
	})

	return {
		totalSupply: totalSupply as bigint,
		reserveBalance: reserveBalance as bigint,
		currentPrice: currentPrice as bigint,
		slope: slope as bigint,
	}
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

// --- Read current metrics from AgentMetrics contract ---
const readCurrentMetrics = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): OnChainMetrics => {
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
		maxDrawdownBps: metrics.maxDrawdownBps,
		sharpeRatioScaled: metrics.sharpeRatioScaled,
		tvlManaged: metrics.tvlManaged,
		totalTrades: metrics.totalTrades,
		lastUpdated: metrics.lastUpdated,
	}
}

// --- Compute updated metrics from on-chain bonding curve state ---
// Deterministic computation: all DON nodes read same on-chain state,
// apply same formula, reach same result for consensus.
//
// Logic:
//   - TVL = reserveBalance (ETH locked in curve, scaled to USDC-like units)
//   - totalTrades = previous totalTrades + delta based on supply changes
//   - ROI derived from price appreciation: (currentPrice - basePrice) / basePrice
//   - Win rate increases with positive supply momentum, decreases otherwise
//   - Drawdown inversely correlated with reserve health
//   - Sharpe ratio computed from ROI / drawdown proxy
const computeMetrics = (
	agentId: number,
	curveState: CurveState,
	currentMetrics: OnChainMetrics,
): ComputedMetrics => {
	const ONE_TOKEN = 1000000000000000000n // 1e18
	const BASE_PRICE = 100000000000000n // 0.0001 ether (deploy default)

	// Supply in whole tokens
	const supplyTokens = curveState.totalSupply / ONE_TOKEN

	// TVL: reserve balance converted to USDC-like decimals (1 ETH ~ $3000 for demo)
	// reserveBalance is in wei, convert to 6-decimal "USD" equivalent
	const ethToUsdRate = 3000n
	const tvlManaged = Number((curveState.reserveBalance * ethToUsdRate) / 1000000000000n) // wei -> 6 decimals

	// Trade count: increment by supply DELTA since last observation (not total supply)
	// Each whole-token change in supply represents ~1 trade
	const previousTrades = Number(currentMetrics.totalTrades)
	const previousSupply = previousTrades > 0 ? BigInt(previousTrades) : 0n
	const supplyDelta = supplyTokens > previousSupply ? Number(supplyTokens - previousSupply) : 0
	const totalTrades = previousTrades + supplyDelta

	// ROI: price appreciation in basis points x 100
	// roiBps = ((currentPrice - basePrice) / basePrice) * 10000 * 100
	let roiBps: number
	if (curveState.currentPrice > BASE_PRICE) {
		const appreciation = curveState.currentPrice - BASE_PRICE
		// Scale: (appreciation / basePrice) * 1_000_000 for bps x 100
		roiBps = Number((appreciation * 1000000n) / BASE_PRICE)
	} else {
		roiBps = Number(currentMetrics.roiBps)
	}

	// Win rate: higher supply = more demand = higher win rate
	// Base win rate from existing metrics, adjusted by supply momentum
	let winRateBps = Number(currentMetrics.winRateBps)
	if (supplyTokens > 10n) {
		// Strong demand: nudge win rate up (capped at 9500 bps = 95%)
		winRateBps = Math.min(winRateBps + Number(supplyTokens) * 10, 9500)
	} else if (supplyTokens > 0n) {
		// Some demand: slight improvement
		winRateBps = Math.min(winRateBps + Number(supplyTokens) * 5, 9500)
	}

	// Max drawdown: inversely correlated with reserve health
	// Higher reserve relative to supply = lower drawdown risk
	let maxDrawdownBps = Number(currentMetrics.maxDrawdownBps)
	if (supplyTokens > 0n && curveState.reserveBalance > 0n) {
		// Reserve per token (in wei)
		const reservePerToken = curveState.reserveBalance / supplyTokens
		// If reserve per token is high relative to current price, drawdown is low
		if (reservePerToken >= curveState.currentPrice) {
			maxDrawdownBps = Math.max(maxDrawdownBps - 100, 500) // improve, floor at 5%
		} else {
			maxDrawdownBps = Math.min(maxDrawdownBps + 200, 8000) // worsen, cap at 80%
		}
	}

	// Sharpe ratio: roiBps / maxDrawdownBps, scaled x 10000
	let sharpeRatioScaled = Number(currentMetrics.sharpeRatioScaled)
	if (maxDrawdownBps > 0 && roiBps > 0) {
		sharpeRatioScaled = Math.floor((roiBps * 10000) / maxDrawdownBps)
	}

	return {
		agentId,
		roiBps,
		winRateBps,
		maxDrawdownBps,
		sharpeRatioScaled,
		tvlManaged,
		totalTrades,
	}
}

// --- Write updated metrics on-chain via DON consensus report ---
const writeMetricsOnChain = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	data: ComputedMetrics,
): string => {
	const callData = encodeFunctionData({
		abi: AgentMetricsABI,
		functionName: 'updateMetrics',
		args: [
			BigInt(data.agentId),
			BigInt(data.roiBps),
			BigInt(data.winRateBps),
			BigInt(data.maxDrawdownBps),
			BigInt(data.sharpeRatioScaled),
			BigInt(data.tvlManaged),
			BigInt(data.totalTrades),
		],
	})

	runtime.log(`Writing metrics for agent ${data.agentId}: ROI=${data.roiBps}bps, trades=${data.totalTrades}`)

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
			receiver: runtime.config.agentMetricsAddress,
			report: reportResponse,
			gasConfig: {
				gasLimit: runtime.config.gasLimit,
			},
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to write metrics: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	runtime.log(`Metrics written for agent ${data.agentId} at tx: ${bytesToHex(txHash)}`)

	return bytesToHex(txHash)
}

// --- Adjust bonding curve slope based on computed performance ---
const adjustBondingCurveSlope = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
	curveAddress: Address,
	roiBps: number,
): void => {
	if (curveAddress === zeroAddress) {
		runtime.log(`No bonding curve for agent ${agentId}, skipping slope adjustment`)
		return
	}

	// Calculate new slope based on performance
	// Higher ROI -> steeper slope (demand should increase price faster)
	// Lower/negative ROI -> flatter slope
	const BASE_SLOPE = 10000000000000n // 0.00001 ether
	let newSlope: bigint

	if (roiBps > 1000000) {
		// >100% ROI (1_000_000 bps x 100): aggressive slope (2x base)
		newSlope = BASE_SLOPE * 2n
	} else if (roiBps > 500000) {
		// >50% ROI: moderate increase (1.5x base)
		newSlope = (BASE_SLOPE * 3n) / 2n
	} else if (roiBps > 0) {
		// Positive ROI: base slope
		newSlope = BASE_SLOPE
	} else if (roiBps > -500000) {
		// Slightly negative: reduced slope (0.5x base)
		newSlope = BASE_SLOPE / 2n
	} else {
		// Very negative: minimal slope (0.25x base)
		newSlope = BASE_SLOPE / 4n
	}

	const adjustCallData = encodeFunctionData({
		abi: AgentBondingCurveABI,
		functionName: 'adjustSlope',
		args: [newSlope],
	})

	runtime.log(`Adjusting slope for agent ${agentId} at ${curveAddress}: newSlope=${newSlope}`)

	const reportResponse = runtime
		.report({
			encodedPayload: hexToBase64(adjustCallData),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: curveAddress,
			report: reportResponse,
			gasConfig: {
				gasLimit: runtime.config.gasLimit,
			},
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		runtime.log(`Warning: slope adjustment failed for agent ${agentId}: ${resp.errorMessage || resp.txStatus}`)
	} else {
		const txHash = resp.txHash || new Uint8Array(32)
		runtime.log(`Slope adjusted for agent ${agentId} at tx: ${bytesToHex(txHash)}`)
	}
}

// --- Main CRE handler: runs on each cron tick ---
const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	runtime.log(`AgentIndex Tracker running at ${new Date().toISOString()}`)
	runtime.log(`Processing agents: ${runtime.config.agentIds.join(', ')}`)

	const evmClient = getEvmClient(runtime)
	const results: string[] = []

	for (const agentId of runtime.config.agentIds) {
		runtime.log(`--- Processing agent ${agentId} ---`)

		// Step 1: Get bonding curve address from factory
		const curveAddress = getCurveAddress(runtime, evmClient, agentId)
		if (curveAddress === zeroAddress) {
			runtime.log(`No curve found for agent ${agentId}, skipping`)
			results.push(`skipped:${agentId}`)
			continue
		}
		runtime.log(`Curve address: ${curveAddress}`)

		// Step 2: Read bonding curve state (deterministic on-chain data)
		const curveState = readCurveState(runtime, evmClient, curveAddress)
		runtime.log(`Curve state: supply=${curveState.totalSupply}, reserve=${curveState.reserveBalance}, price=${curveState.currentPrice}, slope=${curveState.slope}`)

		// Step 3: Read current metrics from AgentMetrics
		const currentMetrics = readCurrentMetrics(runtime, evmClient, agentId)
		runtime.log(`Current metrics: ROI=${currentMetrics.roiBps}, trades=${currentMetrics.totalTrades}`)

		// Step 4: Compute new metrics from on-chain state
		const computed = computeMetrics(agentId, curveState, currentMetrics)
		runtime.log(`Computed metrics: ROI=${computed.roiBps}, winRate=${computed.winRateBps}, trades=${computed.totalTrades}`)

		// Step 5: Only update if data has changed
		if (
			BigInt(computed.roiBps) === currentMetrics.roiBps &&
			BigInt(computed.totalTrades) === currentMetrics.totalTrades &&
			BigInt(computed.tvlManaged) === currentMetrics.tvlManaged
		) {
			runtime.log(`No changes for agent ${agentId}, skipping update`)
			results.push(`no-update:${agentId}`)
			continue
		}

		// Step 6: Write verified metrics on-chain via DON consensus
		const txHash = writeMetricsOnChain(runtime, evmClient, computed)

		// Step 7: Adjust bonding curve slope based on computed performance
		adjustBondingCurveSlope(runtime, evmClient, agentId, curveAddress, computed.roiBps)

		results.push(`updated:${agentId}:${txHash}`)
	}

	runtime.log(`Processing complete: ${results.join(', ')}`)
	return results.join(',')
}

// --- Workflow initialization ---
const initWorkflow = (config: Config) => {
	const cronTrigger = new CronCapability()

	return [
		handler(
			cronTrigger.trigger({
				schedule: config.schedule,
			}),
			onCronTrigger,
		),
	]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({
		configSchema,
	})
	await runner.run(initWorkflow)
}

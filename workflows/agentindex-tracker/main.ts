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
import { AgentMetricsABI, AgentBondingCurveABI, BondingCurveFactoryABI, AgentRegistryABI } from '../contracts/abi'

// --- Config Schema ---
const configSchema = z.object({
	schedule: z.string(),
	agentMetricsAddress: z.string(),
	agentRegistryAddress: z.string(),
	bondingCurveFactoryAddress: z.string(),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
	agentIds: z.array(z.number()),
	tenderlyAccount: z.string(),
	tenderlyProject: z.string(),
	tenderlyAccessKey: z.string(),
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

// --- Read agent wallet from AgentRegistry ---
const readAgentWallet = (
	runtime: Runtime<Config>,
	evmClient: EVMClient,
	agentId: number,
): Address => {
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

	return (agent.wallet ?? agent[1] ?? zeroAddress) as Address
}

// --- Read real-world performance data via Tenderly API ---
const fetchRealAgentPerformance = async (
	runtime: Runtime<Config>,
	agentWallet: Address,
): Promise<{ trades: number; wins: number; volumeUsd: number; profitUsd: number }> => {
	runtime.log(`Fetching performance from Tenderly for wallet: ${agentWallet}`)

	const url = `https://api.tenderly.co/api/v1/account/${runtime.config.tenderlyAccount}/project/${runtime.config.tenderlyProject}/transactions?wallet=${agentWallet}&limit=100`

	const res = await runtime.fetch(url, {
		headers: { 'X-Access-Key': runtime.config.tenderlyAccessKey },
	})
	const data = await res.json()
	const txs = (data as any).transactions ?? []

	// Count successful DeFi interactions
	const defiTxs = txs.filter((tx: any) =>
		tx.status === true &&
		['swap', 'deposit', 'withdraw', 'harvest', 'buy', 'sell'].some(
			(m: string) => (tx.decoded_input?.name ?? '').toLowerCase().includes(m)
		)
	)
	const wins = defiTxs.filter((tx: any) => (tx.net_value_usd ?? 0) > 0).length
	const profitUsd = defiTxs.reduce((sum: number, tx: any) => sum + (tx.net_value_usd ?? 0), 0)
	const volumeUsd = defiTxs.reduce((sum: number, tx: any) => sum + Math.abs(tx.value_usd ?? 0), 0)

	runtime.log(`Tenderly data: ${defiTxs.length} DeFi txs, ${wins} wins, $${profitUsd} profit`)

	return { trades: defiTxs.length, wins, volumeUsd, profitUsd }
}

// --- Compute updated metrics from real-world activity + bonding curve ---
const computeMetrics = async (
	runtime: Runtime<Config>,
	agentId: number,
	agentWallet: Address,
	curveState: CurveState,
	currentMetrics: OnChainMetrics,
): Promise<ComputedMetrics> => {
	// Fetch real performance data from the agent's actual wallet
	const realData = await fetchRealAgentPerformance(runtime, agentWallet)

	const BASE_PRICE = 100000000000000n

	// TVL: bonding curve reserve converted to USD (simplified: ETH × 3000)
	const ethToUsdRate = 3000n
	const curveReserveUsd = Number((curveState.reserveBalance * ethToUsdRate) / 1000000000000000000n)
	const tvlManaged = Math.round(curveReserveUsd)

	// ROI: combine real profit ROI with bonding curve price appreciation
	const priceAppreciationBps = curveState.currentPrice > BASE_PRICE
		? Number(((curveState.currentPrice - BASE_PRICE) * 10000n) / BASE_PRICE)
		: 0

	const realRoiBps = realData.volumeUsd > 0
		? Math.round((realData.profitUsd * 10000) / realData.volumeUsd)
		: 0
	const combinedRoiBps = Math.floor((priceAppreciationBps + realRoiBps) / 2)

	// Win rate: actual wins / total trades (in bps)
	const winRateBps = realData.trades > 0
		? Math.round((realData.wins / realData.trades) * 10000)
		: 0

	// Max drawdown: simplified — largest single loss as % of volume
	// In production this would track peak-to-trough equity
	const maxDrawdownBps = realData.volumeUsd > 0
		? Math.min(10000, Math.round(Math.abs(Math.min(0, realData.profitUsd)) / realData.volumeUsd * 10000))
		: 0

	// Sharpe: simplified ROI / assumed std dev
	const sharpeRatioScaled = combinedRoiBps > 0 ? Math.round(combinedRoiBps / 100) : 0

	return {
		agentId,
		roiBps: combinedRoiBps,
		winRateBps,
		maxDrawdownBps,
		sharpeRatioScaled,
		tvlManaged,
		totalTrades: realData.trades, // absolute count, NOT cumulative
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
const onCronTrigger = async (runtime: Runtime<Config>, payload: CronPayload): Promise<string> => {
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

		// Step 3: Read agent wallet from AgentRegistry
		const agentWallet = readAgentWallet(runtime, evmClient, agentId)
		if (agentWallet === zeroAddress) {
			runtime.log(`No wallet registered for agent ${agentId}, skipping`)
			results.push(`no-wallet:${agentId}`)
			continue
		}
		runtime.log(`Agent wallet: ${agentWallet}`)

		// Step 4: Read current metrics from AgentMetrics
		const currentMetrics = readCurrentMetrics(runtime, evmClient, agentId)
		runtime.log(`Current metrics: ROI=${currentMetrics.roiBps}, trades=${currentMetrics.totalTrades}`)

		// Step 5: Compute new metrics from real Tenderly data + on-chain state
		const computed = await computeMetrics(runtime, agentId, agentWallet, curveState, currentMetrics)
		runtime.log(`Computed metrics: ROI=${computed.roiBps}, winRate=${computed.winRateBps}, trades=${computed.totalTrades}`)

		// Step 6: Only update if data has changed
		if (
			BigInt(computed.roiBps) === currentMetrics.roiBps &&
			BigInt(computed.totalTrades) === currentMetrics.totalTrades &&
			BigInt(computed.tvlManaged) === currentMetrics.tvlManaged
		) {
			runtime.log(`No changes for agent ${agentId}, skipping update`)
			results.push(`no-update:${agentId}`)
			continue
		}

		// Step 7: Write verified metrics on-chain via DON consensus
		const txHash = writeMetricsOnChain(runtime, evmClient, computed)

		// Step 8: Adjust bonding curve slope based on computed performance
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

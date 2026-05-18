import CardanoAPI from "./cardanoApi";
import { calculateUptime } from "./metricsFormatter";
import { getMetricsFromLast7Days } from "./metricsDb";

const CARDANO_GENESIS_DATE = "2017-09-23"; // Cardano mainnet launch

export async function fetchCardanoMetrics() {
	const cardanoApi = new CardanoAPI(
		process.env.BLOCKFROST_PROJECT_ID,
		process.env.MAESTRO_API_KEY,
		process.env.CARDANOSCAN_API_KEY,
		process.env.ADASTATS_API_KEY
	);

	try {
		const [networkInfo, currentEpoch, adaPrice, activePools, tvl] =
			await Promise.all([
				cardanoApi.getNetworkInfo(),
				cardanoApi.getCurrentEpoch(),
				cardanoApi.getADAPrice(),
				cardanoApi.getActivePools(),
				cardanoApi.getTVL(),
			]);

		const cardanoActivityMetrics =
			await cardanoApi.getCardanoActivityMetricsFromAdaStats();

		// Calculate uptime
		const uptime = calculateUptime(CARDANO_GENESIS_DATE);

		if (
			!networkInfo ||
			!currentEpoch ||
			!adaPrice ||
			!activePools ||
			!tvl
		) {
			throw new Error("Failed to fetch essential Cardano metrics");
		}

		// Extract metrics from Blockfrost API responses
		const metrics = {
			uptime,
			tvl: tvl || 0, // DeFi TVL in USD
			stakedAda: Number(networkInfo?.stake.active) || 0,
			totalSupply: Number(networkInfo?.supply.total) || 0, // Total supply
			treasuryAda: Number(networkInfo?.supply.treasury) || 0,
			activeStakePools: activePools?.totalActivePools || 0,
			transactions24h: cardanoActivityMetrics?.transactionCount || 0,
			activeWallets24h: cardanoActivityMetrics?.activeWalletCount || 0,
			epoch:
				currentEpoch?.epoch_no ||
				cardanoActivityMetrics?.currentEpoch ||
				0,
			adaPrice: adaPrice?.cardano.usd || 0.87,
		};

		return metrics;
	} catch (error) {
		console.error("Error fetching Cardano metrics:", error);

		// Return empty object if any error occurs
		return {};
	}
}

export function calculateWeeklyPercentageChange(firstValue, lastValue) {
	if (!firstValue || firstValue === 0) return 0;
	return ((lastValue - firstValue) / firstValue) * 100;
}

export async function getWeeklyMetricsChanges() {
	const metricsData = await getMetricsFromLast7Days();

	if (!metricsData || metricsData.length < 2) {
		return null; // Insufficient data
	}

	// Get first (oldest) and last (newest) entries
	// Data is already ordered by createdAt ascending from the database query
	const firstEntry = metricsData[0];
	const lastEntry = metricsData[metricsData.length - 1];

	// Calculate weekly changes from first to last entry
	const changes = {
		uptime: calculateWeeklyPercentageChange(
			firstEntry.uptime,
			lastEntry.uptime
		),
		tvl: calculateWeeklyPercentageChange(firstEntry.tvl, lastEntry.tvl),
		stakedAda: calculateWeeklyPercentageChange(
			firstEntry.stakedAda,
			lastEntry.stakedAda
		),
		treasuryAda: calculateWeeklyPercentageChange(
			firstEntry.treasuryAda,
			lastEntry.treasuryAda
		),
		activeStakePools: calculateWeeklyPercentageChange(
			firstEntry.activeStakePools,
			lastEntry.activeStakePools
		),
		transactions: calculateWeeklyPercentageChange(
			firstEntry.transactions24h,
			lastEntry.transactions24h
		),
		activeWallets: calculateWeeklyPercentageChange(
			firstEntry.activeWallets24h,
			lastEntry.activeWallets24h
		),
		adaPrice: calculateWeeklyPercentageChange(
			firstEntry.adaPrice,
			lastEntry.adaPrice
		),
	};

	return changes;
}

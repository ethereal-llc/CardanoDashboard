import axios from "axios";
import {
	BlockFrostAPI,
	BlockfrostServerError,
} from "@blockfrost/blockfrost-js";

const BLOCKFROST_BASE_URL = "https://cardano-mainnet.blockfrost.io/api/v0";
const MAESTRO_BASE_URL = "https://mainnet.gomaestro-api.org/v1";
const CARDANOSCAN_BASE_URL = "https://api.cardanoscan.io/api/v1";
const ADASTATS_INFO_BASE_URL = "https://adastats.info/public-api/v1";

class CardanoAPI {
	blockfrostClient;
	axiosBlockfrostClient;
	axiosMaestroClient;
	axiosCardanoScanClient;
	axiosAdastatsClient;

	constructor(projectId, maestroApiKey, cardanoScanApiKey, adastatsApiKey) {
		this.blockfrostClient = new BlockFrostAPI({
			projectId: projectId,
			requestTimeout: 10000,
		});
		this.axiosBlockfrostClient = axios.create({
			baseURL: BLOCKFROST_BASE_URL,
			headers: {
				project_id: projectId,
				"Content-Type": "application/json",
			},
		});
		this.axiosMaestroClient = axios.create({
			baseURL: MAESTRO_BASE_URL,
			headers: {
				"api-key": maestroApiKey,
				"Content-Type": "application/json",
			},
		});
		this.axiosCardanoScanClient = axios.create({
			baseURL: CARDANOSCAN_BASE_URL,
			headers: {
				apiKey: cardanoScanApiKey,
				"Content-Type": "application/json",
			},
		});
		this.axiosAdastatsClient = axios.create({
			baseURL: ADASTATS_INFO_BASE_URL,
			headers: {
				"Public-Api-Key": adastatsApiKey,
				"Content-Type": "application/json",
			},
		});
	}

	async getNetworkInfo() {
		try {
			const response = await this.axiosBlockfrostClient.get("/network");
			return response.data;
		} catch (error) {
			console.error("Error fetching network info:", error);
			throw error;
		}
	}

	async getCurrentEpoch() {
		try {
			const response = await this.axiosMaestroClient.get(
				"/epochs/current"
			);
			return response.data.data;
		} catch (error) {
			console.error("Error fetching current epoch:", error);
			throw error;
		}
	}

	async getActivePools() {
		try {
			const limit = 1;
			let pageNo = 1;
			let totalActivePools = 0;

			const response = await this.axiosCardanoScanClient.get(
				"/pool/list",
				{
					params: { limit, pageNo },
				}
			);
			totalActivePools = response.data?.count;

			return { totalActivePools };
		} catch (error) {
			console.error("Error fetching active pools:", error);
			throw error;
		}
	}

	async getTVL() {
		try {
			const response = await fetch("https://api.llama.fi/v2/chains");
			const data = await response.json();
			const cardanoEntry = data.find(
				(entry: any) =>
					entry.name === "Cardano" && entry.tokenSymbol === "ADA"
			);
			return cardanoEntry ? cardanoEntry.tvl : null;
		} catch (error) {
			console.error("Error fetching DeFi TVL:", error);
			throw error;
		}
	}

	async getCardanoActivityMetricsFromAdaStats(): Promise<{
		currentEpoch: number;
		transactionCount: number;
		activeWalletCount: number;
	}> {
		try {
			let currentEpoch = 0;
			let transactionCount = 0;
			let activeWalletCount = 0;

			const response = await this.axiosAdastatsClient.get(
				"/daily-metrics"
			);
			currentEpoch = response.data?.currentEpoch ?? 0;
			transactionCount = response.data?.transactionCount ?? 0;
			activeWalletCount = response.data?.activeAddresses ?? 0;

			if (
				currentEpoch === 0 ||
				transactionCount === 0 ||
				activeWalletCount === 0
			) {
				throw new Error(
					`Invalid response from adastats: ${currentEpoch}, ${transactionCount}, ${activeWalletCount}`
				);
			}

			return { currentEpoch, transactionCount, activeWalletCount };
		} catch (error) {
			console.error(
				"Error fetching activity metrics from adastats:",
				error
			);
			throw error;
		}
	}

	async getCardanoActivityMetrics(): Promise<{
		currentEpoch: number;
		transactionCount: number;
		activeWalletCount: number;
	}> {
		const wait = (ms: number) =>
			new Promise((resolve) => setTimeout(resolve, ms));

		const DELAY_MS_PER_REQUEST = 100; // Reduced delay for faster processing
		const MAX_BLOCKS_TO_CHECK = 4320; // ~1 day of blocks
		const MAX_RETRIES = 2; // Reduced retries for faster failure

		const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

		let transactionCount = 0;
		const activeAddresses = new Set<string>();

		// Get latest block
		let latestBlock;
		try {
			latestBlock = await this.blockfrostClient.blocksLatest();
			await wait(DELAY_MS_PER_REQUEST);
		} catch (error) {
			console.error(
				"Failed to fetch latest block from Blockfrost:",
				error
			);
			throw new Error("Could not retrieve latest blockchain data.");
		}

		if (!latestBlock || !latestBlock.height) {
			throw new Error("No latest block information available.");
		}

		let currentBlockNumber: number = latestBlock.height;
		let blocksChecked = 0;

		// Process blocks in batches for better performance
		while (currentBlockNumber >= 0 && blocksChecked < MAX_BLOCKS_TO_CHECK) {
			let block;
			let retries = 0;

			// Try to fetch block with retries
			while (retries < MAX_RETRIES) {
				try {
					block = await this.blockfrostClient.blocks(
						currentBlockNumber
					);
					await wait(DELAY_MS_PER_REQUEST);
					break;
				} catch (error) {
					if (
						error instanceof BlockfrostServerError &&
						error.status_code === 429
					) {
						retries++;
						console.warn(
							`Rate limit hit fetching block ${currentBlockNumber}. Retrying...`
						);
						await wait(retries * 1000); // Shorter backoff
					} else {
						console.warn(
							`Failed to fetch block ${currentBlockNumber}:`,
							error
						);
						block = null;
						break;
					}
				}
			}

			if (!block || block.time < twentyFourHoursAgo) {
				break; // Stop if block is too old or failed to fetch
			}

			// Get transaction hashes for this block
			let txHashesInBlock: string[];
			try {
				txHashesInBlock = await this.blockfrostClient.blocksTxs(
					block.hash
				);
				await wait(DELAY_MS_PER_REQUEST);
				transactionCount += txHashesInBlock.length;
			} catch (error) {
				console.warn(
					`Could not fetch transaction hashes for block ${block.hash}, skipping.`
				);
				currentBlockNumber--;
				blocksChecked++;
				continue;
			}

			for (const txHash of txHashesInBlock) {
				try {
					const txUtxos = await this.blockfrostClient.txsUtxos(
						txHash
					);
					await wait(DELAY_MS_PER_REQUEST);

					// Add addresses from inputs and outputs
					for (const input of txUtxos.inputs) {
						if (input.address) activeAddresses.add(input.address);
					}
					for (const output of txUtxos.outputs) {
						if (output.address) activeAddresses.add(output.address);
					}
				} catch (txError) {
					console.warn(
						`Could not fetch UTXOs for transaction ${txHash}:`,
						txError
					);
				}
			}

			currentBlockNumber--;
			blocksChecked++;
		}

		return {
			currentEpoch: latestBlock.epoch,
			transactionCount: transactionCount,
			activeWalletCount: activeAddresses.size,
		};
	}

	async getADAPrice() {
		try {
			const response = await fetch(
				"https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd"
			);
			return await response.json();
		} catch (error) {
			console.error("Error fetching ada price:", error);
			throw error;
		}
	}
}

export default CardanoAPI;

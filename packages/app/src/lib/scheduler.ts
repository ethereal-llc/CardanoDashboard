import TwitterAPI from "./twitterApi";
import { fetchCardanoMetrics, getWeeklyMetricsChanges } from "./cardanoMetrics";
import {
	createTweetContent,
	createWeeklyComparisonTweet,
} from "./metricsFormatter";
import cron from "node-cron";
import dotenv from "dotenv";
import { storeCardanoMetrics } from "./metricsDb";

dotenv.config({ path: require("path").resolve(__dirname, "../../.env") });

// Manual trigger function for testing
export async function triggerDailyTweet() {
	console.log("Triggering daily Cardano metrics tweet...");

	try {
		if (
			!process.env.X_API_KEY ||
			!process.env.X_API_SECRET ||
			!process.env.X_ACCESS_TOKEN ||
			!process.env.X_ACCESS_TOKEN_SECRET ||
			!process.env.BLOCKFROST_PROJECT_ID
		) {
			console.error("Missing required environment variables");
			throw new Error("Missing required environment variables");
		}

		const twitterApi = new TwitterAPI({
			apiKey: process.env.X_API_KEY,
			apiSecret: process.env.X_API_SECRET,
			accessToken: process.env.X_ACCESS_TOKEN,
			accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
		});

		const metrics = await fetchCardanoMetrics();
		console.log(metrics);
		console.log("Saving daily tweet...");

		await storeCardanoMetrics(metrics);

		const tweetContent = createTweetContent(metrics);
		console.log(tweetContent);

		await twitterApi.postTweet(tweetContent);
		console.log("Daily tweet posted successfully!");

		return { success: true, message: "Daily tweet posted successfully" };
	} catch (error) {
		console.error("Error posting daily tweet:", error);
		throw error;
	}
}

// Weekly metrics comparison function
export async function triggerWeeklyTweet() {
	console.log("Triggering weekly Cardano metrics comparison tweet...");

	try {
		if (
			!process.env.X_API_KEY ||
			!process.env.X_API_SECRET ||
			!process.env.X_ACCESS_TOKEN ||
			!process.env.X_ACCESS_TOKEN_SECRET
		) {
			console.error("Missing required environment variables");
			throw new Error("Missing required environment variables");
		}

		const twitterApi = new TwitterAPI({
			apiKey: process.env.X_API_KEY,
			apiSecret: process.env.X_API_SECRET,
			accessToken: process.env.X_ACCESS_TOKEN,
			accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
		});

		const changes = await getWeeklyMetricsChanges();

		const tweetContent = createWeeklyComparisonTweet(changes);
		console.log(tweetContent);

		await twitterApi.postTweet(tweetContent);
		console.log("Weekly comparison tweet posted successfully!");

		return {
			success: true,
			message: "Weekly comparison tweet posted successfully",
		};
	} catch (error) {
		console.error("Error posting weekly comparison tweet:", error);
		throw error;
	}
}

const CRON_DAILY_TWEET = process.env.CRON_DAILY_TWEET!;
const CRON_WEEKLY_TWEET = process.env.CRON_WEEKLY_TWEET!;

// Daily tweet at 15:00 CET - "0 15 * * *"
cron.schedule(CRON_DAILY_TWEET, () => {
	triggerDailyTweet();
});

// Weekly comparison tweet every Friday at 17:00 CET - "0 17 * * 5"
cron.schedule(CRON_WEEKLY_TWEET, () => {
	triggerWeeklyTweet();
});

console.log(
	`Scheduler started. Daily tweet at ${CRON_DAILY_TWEET} UTC, Weekly comparison at  ${CRON_DAILY_TWEET} UTC.`
);

// Allow manual run for testing
if (require.main === module) {
	const arg = process.argv[2];
	if (arg === "daily") {
		triggerDailyTweet();
	} else if (arg === "weekly") {
		triggerWeeklyTweet();
	}
}

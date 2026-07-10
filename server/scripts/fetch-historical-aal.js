const { fetchHistoricalMarketData } = require('../src/services/dataIngestion');
const { saveDataset } = require('../src/services/datasets');

async function run() {
    const symbol = 'AAL';
    // American Airlines daily data from 2005-01-01 to today
    const startTs = Math.floor(new Date('2005-01-01T00:00:00.000Z').getTime() / 1000);
    const endTs = Math.floor(new Date().getTime() / 1000);

    console.log(`Starting historical fetch for ${symbol} from ${new Date(startTs * 1000).toISOString().split('T')[0]} to ${new Date(endTs * 1000).toISOString().split('T')[0]}...`);

    const providers = ['polygon', 'twelve_data', 'alpha_vantage'];
    let bestProvider = null;
    let bestResult = null;

    for (const provider of providers) {
        try {
            console.log(`Trying provider: ${provider}...`);
            const result = await fetchHistoricalMarketData(symbol, startTs, endTs, provider, { adjustment: 'none' });
            if (result && result.rows && result.rows.length > 0) {
                console.log(`Successfully fetched ${result.rows.length} rows from ${provider}!`);
                if (!bestResult || result.rows.length > bestResult.rows.length) {
                    bestResult = result;
                    bestProvider = provider;
                }
            } else {
                console.warn(`No rows returned from ${provider}`);
            }
        } catch (err) {
            console.error(`Failed to fetch from ${provider}:`, err.message);
        }
    }

    if (!bestResult) {
        console.error('All providers failed to fetch AAL data');
        process.exit(1);
    }

    console.log(`Chosen best provider: ${bestProvider} with ${bestResult.rows.length} data points.`);
    const data = bestResult;

    const payload = {
        ticker: symbol,
        name: symbol,
        companyName: 'American Airlines Group Inc.',
        uploadDate: new Date().toISOString(),
        tag: null,
        adjustedForSplits: 1, // Polygon and twelve_data return split-adjusted data
        data: data.rows
    };

    console.log(`Saving dataset to DB...`);
    saveDataset(payload);
    console.log(`Successfully backfilled AAL dataset with ${data.rows.length} data points!`);
    process.exit(0);
}

run().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
});

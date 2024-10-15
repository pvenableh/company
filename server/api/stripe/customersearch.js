import Stripe from "stripe";

export default defineEventHandler(async (event) => {
    // const query = getQuery(event)
    const body = await readBody(event)

    const stripe = new Stripe("sk_test_MEBnHMrFHTpPJsl88qX92GbI00wdGnFKSm", {
        apiVersion: '2022-11-15',
    });
    const customer = await stripe.customers.search({
        query: `email: "${body.email}"`,
    });

    return body
});
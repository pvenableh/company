import Stripe from "stripe";
export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const stripe = new Stripe("sk_test_t0mj7bh31ETmyYSXvVez5Gjv");
    const customer = await stripe.customers.retrieve(
        query.customer,
    );

    return customer
});
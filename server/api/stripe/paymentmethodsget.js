import Stripe from "stripe";

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()
    console.log(config)
    const query = getQuery(event)
    const stripe = new Stripe('sk_test_51NYWsGF0lK6IMCafZk3rSLVAqCUA9HS7c3tG3XNF7kcs1uhbI9wGDNgyZoPcWiFnHitALS4qa2k5Pt3iaAxTf8LW00kEbGEx8s');

    const paymentMethods = await stripe.customers.listPaymentMethods(
        query.customer, {
            type: 'card'
        }
    );
    return paymentMethods
});
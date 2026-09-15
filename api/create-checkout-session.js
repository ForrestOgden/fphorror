export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  const site = process.env.SITE_URL;
  if (!secret || !price || !site) {
    return res.status(503).json({ error: 'Checkout is not configured.' });
  }

  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('line_items[0][price]', price);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', `${site}/?purchase=success`);
  body.set('cancel_url', `${site}/?purchase=cancelled`);
  body.set('allow_promotion_codes', 'true');
  body.set('billing_address_collection', 'auto');

  const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await stripe.json();
  if (!stripe.ok) return res.status(stripe.status).json({ error: data?.error?.message || 'Stripe error' });
  return res.status(200).json({ url: data.url });
}

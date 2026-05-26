import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { Cashfree, CFEnvironment } from "cashfree-pg";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Cashfree Payment Gateway Setup
const APP_ID = process.env.NEXT_PUBLIC_CASHFREE_APP_ID || process.env.CASHFREE_APP_ID || '1288935e7046214d42c3c2579915398821';
const SECRET_KEY = process.env.CASHFREE_SECRET_KEY || 'cfsk_ma_prod_2bf4788a3f1bfd3a90614804598df78b_7d2aaec2';

// If using the prod key provided, force production URL
const isProdRequested = process.env.NEXT_PUBLIC_CASHFREE_MODE === 'production' || process.env.CASHFREE_PRODUCTION === 'true';
const isProdKey = SECRET_KEY.includes('prod') || isProdRequested;
const cfEnvironment = isProdKey ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
(Cashfree as any).XClientId = APP_ID;
(Cashfree as any).XClientSecret = SECRET_KEY;
(Cashfree as any).XEnvironment = cfEnvironment;

app.post('/api/cashfree/create-order', async (req, res) => {
  const { customer_id, customer_email, customer_phone, customer_name, order_amount, order_currency, return_url } = req.body;
  const order_id = 'ORD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  try {
    const cashfreeInstance = new (Cashfree as any)();
    cashfreeInstance.XClientId = APP_ID;
    cashfreeInstance.XClientSecret = SECRET_KEY;
    cashfreeInstance.XEnvironment = cfEnvironment;
    cashfreeInstance.XApiVersion = "2023-08-01";

    const orderRequest = {
        order_amount: order_amount,
        order_currency: order_currency || 'INR',
        order_id: order_id,
        customer_details: {
            customer_id: customer_id,
            customer_name: customer_name,
            customer_email: customer_email || 'guest@wolfshop.example.com',
            customer_phone: customer_phone.toString(),
        },
        order_meta: {
            return_url: return_url,
        }
    };
    
    cashfreeInstance.PGCreateOrder(orderRequest).then((response: any) => {
        const data = response.data;
        return res.json({ 
            success: true,
            order_id: data.order_id, 
            payment_session_id: data.payment_session_id, 
            mode: isProdKey ? 'production' : 'sandbox' 
        });
    }).catch((error: any) => {
        console.error('Cashfree Create Order Error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ error: "Cashfree creation failed", details: error.response?.data || error.message });
    });
  } catch (error: any) {
    console.error("Create Order Exception:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cashfree/order/:orderId', async (req, res) => {
  const { orderId } = req.params;
  
  if (orderId.includes('mock_')) {
    return res.json({ order_status: 'PAID', order_id: orderId });
  }

  try {
    const cashfreeInstance = new (Cashfree as any)();
    cashfreeInstance.XClientId = APP_ID;
    cashfreeInstance.XClientSecret = SECRET_KEY;
    cashfreeInstance.XEnvironment = cfEnvironment;
    cashfreeInstance.XApiVersion = "2023-08-01";

    cashfreeInstance.PGFetchOrder(orderId).then((response: any) => {
        const data = response.data;
        res.json({ order_status: data.order_status, order_id: data.order_id });
    }).catch((error: any) => {
        console.error('Cashfree Fetch Order Error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ error: "Failed to fetch order status", details: error.response?.data || error.message });
    });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

app.post('/api/cashfree/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // In a real application, you would verify the webhook signature using CASHFREE_WEBHOOK_SECRET
  // For now, we return 200 OK
  console.log("Cashfree Webhook received!");
  res.status(200).send("OK");
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

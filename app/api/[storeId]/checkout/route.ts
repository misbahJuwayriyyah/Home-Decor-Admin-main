import Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const { products ,shippmentCost} = await req.json(); // Extract products array from the request body

  if (!products || products.length === 0) {
    return new NextResponse("Products are required", { status: 400 });
  }

  const productIds: string[] = products.map((item: any) => item.productId); // Extract productIds from the products array

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  // Loop through the products array to create line items for each product with its respective quantity
  products.forEach(async(item: any) => {
    const { productId, quantity } = item;

    // Fetch product details from the database
    const productDetails = await prismadb.product.findUnique({
      where: { id: productId },
    });

    if (!productDetails) {
      return new NextResponse(`Product with ID ${productId} not found`, { status: 404 });
    }

    line_items.push({
      quantity: quantity,
      price_data: {
        currency: 'PKR',
        product_data: {
          name: productDetails.name,
        },
        unit_amount: productDetails.price.toNumber() * 100,
        tax_behavior: 'exclusive',
      },
      
    });
    
  });

  const order = await prismadb.order.create({
    data: {
      storeId: params.storeId,
      isPaid: true,
      orderItems: {
        create: productIds.map((productId: string) => ({
          product: {
            connect: {
              id: productId,
            },
          },
        })),
      },
    },
  });

  const session = await stripe.checkout.sessions.create({
    line_items,
    mode: 'payment',
    billing_address_collection: 'required',
    phone_number_collection: {
      enabled: true,
    },
    success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
    cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
    metadata: {
      orderId: order.id,
    },
  });

  return NextResponse.json({ url: session.url }, {
    headers: corsHeaders,
  });
};

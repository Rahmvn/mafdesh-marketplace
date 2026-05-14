# Mafdesh – Modern Marketplace Platform

**Live demo:** [https://mafdesh.vercel.app](https://mafdesh.vercel.app)

Mafdesh is a full‑stack marketplace web app that connects buyers and sellers. Built with React, Supabase, and Paystack, it handles user authentication, profile management, product listings, orders, and secure payment verification.

> **Developer:** I built Mafdesh from scratch in 5 months as a solo developer. It demonstrates real‑world product engineering, security hardening, and scalable architecture – ready for job applications and long‑term growth. InshaAllah.

## 🚀 Features

- 🔐 **Authentication** – Email/password signup/login with Supabase Auth, rate‑limit protection, custom email confirmation flow.
- 👤 **User roles** – Buyer and seller profiles with role‑based access control (RBAC).
- 📦 **Product listings** – Sellers can create, edit, and manage products with images, prices, and descriptions.
- 🛒 **Order system** – Buyers add items to cart, place orders, and track status.
- 💳 **Paystack integration** – Secure payment processing with test mode support and webhook verification.
- 🧪 **Stress testing suite** – Script to simulate 100+ concurrent signups (script/cleanup included).
- 🛡️ **Security focus** – Rate limiting, environment‑isolated secrets, AGPL‑3.0 license to protect commercial use.

## 🛠️ Tech Stack

| Area          | Technologies |
|---------------|--------------|
| Frontend      | React, Vite, Tailwind CSS, React Router |
| Backend       | Supabase (PostgreSQL, Auth, Row Level Security) |
| Payments      | Paystack API (webhook + edge functions) |
| Deployment    | Vercel (frontend), Supabase Cloud (backend) |
| Dev tooling   | ESLint, npm, Git |

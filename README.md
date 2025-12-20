# Tuition Management Platform – Server

This repository contains the **backend server** for the Tuition Management Platform.  
It provides APIs for authentication, users, tuitions, applications, and payments.

## What this server does
- Authenticates users using Firebase
- Manages user roles (student, tutor, admin)
- Handles tuition listings and applications
- Updates application status (pending, approved, rejected)
- Stores data in MongoDB
- Supports payments via Stripe

## Tech Stack
- Node.js
- Express.js
- MongoDB
- Firebase Admin SDK
- Stripe

## Running the server locally
```bash
npm install
npm run dev

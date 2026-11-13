# Sai Sindhu Enterprises

A mobile-first business billing, collections and payment management web app.



Use React, TypeScript, Tailwind CSS and Supabase.



The application has only three roles: Owner, Driver and Salesman. Shopkeepers must not have login access.



CORE FEATURES:



OWNER:



- Login securely.

- Add, edit and view shops.

- Create bills for shops.

- View all bills and payments.

- View total sales, total received and outstanding amounts.

- View employee-wise payment collections.



DRIVER AND SALESMAN:



- Login separately.

- View all shops and their pending bills.

- Select a shop and a specific pending bill.

- Enter payment received.

- Select Cash, UPI, Bank Transfer or Cheque.

- Submit payment.

- View their own collection history.



BILL SYSTEM:



- Unique bill number.

- Shop name.

- Bill date.

- Bill amount.

- Automatically calculate remaining balance.

- Support partial and full payments.

- Automatically mark bills as Unpaid, Partially Paid or Paid.



SECURITY:



- Only Owner can create shops and bills.

- Employees cannot create or edit bills.

- Employees cannot delete or edit payment records.

- Every payment must record employee name, amount, date, time and payment mode.

- Only Owner can approve payment corrections.

- Implement proper Supabase Row Level Security policies.



DESIGN:



- Professional modern business dashboard.

- White background, navy blue and green accents.

- Mobile-first responsive layout.

- Simple navigation and easy payment entry interface.



IMPORTANT:

Build the working core application, not just a visual prototype.

Connect Supabase and create the required database tables.

Do not add inventory, products, stock or customer login features.

Prioritize functionality and security over decorative UI.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gopalnamkeen.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fca6bf75-da97-484e-a01e-8f3b2c1e29a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

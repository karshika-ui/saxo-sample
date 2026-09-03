# SAXO Sample Request

A local full-stack application built with HTML, CSS, vanilla JavaScript, Node.js, Express, and SQLite. Permanent users, sessions, master data, and sample requests are stored in `data/saxo.sqlite`. The database is created automatically and starts empty.

## Windows setup

1. Download the repository ZIP from GitHub and extract it.
2. Install [Node.js 22 or newer](https://nodejs.org/).
3. Open PowerShell or Command Prompt in the extracted project folder.
4. Install the dependency:

   ```powershell
   npm install
   ```

5. Start the application:

   ```powershell
   npm start
   ```

6. Open <http://localhost:3000> in Chrome.
7. Create the first account using **Create an account**, then sign in.

Stop the server with `Ctrl+C`. No deployment or GitHub Pages setup is needed.

## Using the application

The database intentionally contains no demo accounts or business records. After signing in, open **Sample Request Fill** and use each **+ Add** button to create the master records needed by the dropdowns. The options are saved in SQLite and become available to all authenticated screens.

Only one CC email address is accepted. It must use a complete address such as `name@company.com`.

## Database tables

- `users` — accounts and salted password hashes.
- `sessions` — hashed authentication session tokens and expiration times.
- `master_data` — centralized employee, dealer, direct customer, unit, location, and product records.
- `sample_requests` — submitted requests connected to users and master records with foreign keys.

## Checks

```powershell
npm run check
```

The project uses Node's built-in SQLite module, so SQLite does not require a separate installation. Delete `data/saxo.sqlite` while the server is stopped if you need to create a new empty database.

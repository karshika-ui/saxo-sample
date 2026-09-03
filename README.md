# SAXO Sample Request

A responsive, dependency-free prototype of the sample request workflow. It includes signup with OTP verification, authentication, central master data, request creation and validation, request tracking, factory notifications, and role-protected ETA updates.

## Preview the application

The application does not require a build step or dependency installation.

1. Open a terminal in this repository.
2. Start a local static web server:

```bash
python3 -m http.server 4173
```

3. Open <http://localhost:4173> in Chrome, Edge, Firefox, or Safari.
4. Sign in with either demo account below. Use the request-user account to create and view requests, or the factory account to set an ETA.

To stop the server, return to the terminal and press `Ctrl+C`.

Opening `index.html` directly may work in modern browsers, but using the local server is recommended so all assets are loaded consistently.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Request user | `request@saxo.com` | `demo123` |
| Factory user | `factory@saxo.com` | `demo123` |

Application data is persisted in the browser's `localStorage` for this prototype, using one shared data object as the source of truth for all master lists.

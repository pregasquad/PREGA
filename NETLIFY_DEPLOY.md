# Deploying to Netlify

This app has a React frontend and an Express backend. Netlify can host the frontend, but you'll need to host the backend separately.

## Prerequisites

1. Your backend must be hosted somewhere (Railway, Render, Heroku, or keep running on Replit)
2. You need the public URL of your backend server

## Deployment Steps

### 1. Host Your Backend First

Deploy your backend to a service that supports Node.js applications:
- **Replit**: Keep your app running here and use the Replit URL
- **Railway**: Push your code and deploy
- **Render**: Connect your repo and deploy
- **Heroku**: Deploy your Express server

Your backend URL will look like: `https://your-app-name.railway.app` or similar

### 2. Deploy Frontend to Netlify

#### Option A: Connect GitHub Repository
1. Push your code to GitHub
2. Go to [Netlify](https://app.netlify.com)
3. Click "Add new site" > "Import an existing project"
4. Connect your GitHub repository
5. Configure build settings:
   - **Build command**: `npm run build:netlify`
   - **Publish directory**: `dist/public`
6. Add environment variable:
   - **Key**: `BACKEND_URL`
   - **Value**: Your backend URL (e.g., `https://your-backend.railway.app`)
7. Click "Deploy"

#### Option B: Manual Deploy (Netlify CLI)
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Build the frontend
npm run build:netlify

# Deploy
netlify deploy --prod --dir=dist/public
```

### 3. Configure Environment Variables on Netlify

1. Go to your site dashboard on Netlify
2. Navigate to **Site configuration** > **Environment variables**
3. Add: `BACKEND_URL` = your backend URL

## How It Works

- The `netlify.toml` file configures Netlify to:
  - Build only the frontend (React/Vite)
  - Proxy all `/api/*` requests to your backend server
  - Handle client-side routing (SPA redirects)

## Important Notes

- **WebSockets**: Socket.io won't work through Netlify's proxy. For real-time features, you'll need to connect directly to your backend URL from the frontend.
- **CORS**: Your backend must allow requests from your Netlify domain.
- **Database**: Your backend needs its own database connection (PostgreSQL/MySQL).

## Backend CORS Configuration

Add your Netlify domain to your backend's CORS configuration:

```javascript
// In your Express server
app.use(cors({
  origin: ['https://your-site.netlify.app', 'http://localhost:5000'],
  credentials: true
}));
```

# Development

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CANTRIP_API_KEY` | *(none)* | Your Cantrip API key |
| `CANTRIP_URL` | `https://api.cantrip.ai` | API URL override (for localhost/staging) |

## Building

```bash
git clone https://github.com/ozten/mcp-server-cantrip.git
cd mcp-server-cantrip
npm install
npm run build
npm start
```

## Testing against local/staging

```bash
CANTRIP_API_KEY=your-key CANTRIP_URL=http://localhost:3000 npm start
```

```txt
npm install
npm run dev
```

```txt
npm run deploy
```

//
Create token
curl -X POST https://your-worker.dev/tokens \
 -H "Authorization: Bearer $ADMIN_SECRET" \
 -H "Content-Type: application/json" \
 -d '{"teamId": "team_123", "name": "Acme Corp"}'

Get token
curl https://your-worker.dev/tokens/sk_abc123...

Refresh token
curl -X POST https://your-worker.dev/token/sk_old_key.../refresh

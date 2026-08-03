# Demo Mode Testing

## Local

1. Open Terminal.
2. Go to the project folder:
   `cd ~/Desktop/elements-baseball-app`
3. Start Vite:
   `npm run dev`
4. Open:
   `http://localhost:5173/demo`

The demo bypasses Discord authentication, uses the existing app components, and disables persistent lineup saving.

## Production

After replacing the project and pushing to GitHub, wait for the Vercel deployment to be Ready, then open:
`https://elements-baseball.vercel.app/demo`

The included `vercel.json` sends direct links such as `/demo`, `/cards`, and `/lineup-builder/...` to the React application instead of returning a Vercel 404.

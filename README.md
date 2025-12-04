# Digital Persona MVP

An AI that speaks as you. Share it with anyone.

## Deploy to Vercel (5 minutes)

### Step 1: Push to GitHub
1. Create a new repository on GitHub
2. Upload these files or push via git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/persona-app.git
   git push -u origin main
   ```

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign up/login with GitHub
2. Click "Add New Project"
3. Import your GitHub repository
4. Click "Deploy" (default settings work)
5. Wait ~60 seconds
6. Your app is live at `your-project.vercel.app`

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## How It Works

1. **Create** - Conversational onboarding learns who you are
2. **Share** - Get a unique link containing your persona
3. **Chat** - Anyone with the link can talk to your AI anonymously

No database needed - the persona is encoded in the share URL.

## What to Test

- Does the onboarding capture enough of you?
- Does your AI sound like you or generic?
- What questions do people instinctively ask?
- Where does it break character?

## Next Iterations

Based on testing feedback:
- Photo upload for profile
- Voice/tone calibration
- Review conversations others have had
- Waitlist capture

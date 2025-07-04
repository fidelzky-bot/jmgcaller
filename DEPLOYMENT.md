# OnRender Deployment Guide

This guide will help you deploy The Illinois Hammer AI Intake System to OnRender.

## Prerequisites

1. **Git Repository**: Push your code to GitHub, GitLab, or Bitbucket
2. **OnRender Account**: Sign up at [render.com](https://render.com)
3. **API Keys**: Ensure you have your OpenAI and Deepgram API keys ready

## Step-by-Step Deployment

### 1. Prepare Your Repository

Make sure your repository contains all the necessary files:
- `app.js` (main application)
- `package.json` (dependencies)
- `services/` directory (all service files)
- `functions/` directory (all function files)
- `render.yaml` (deployment configuration)

### 2. Create OnRender Web Service

1. **Sign in to OnRender** and click "New +" → "Web Service"

2. **Connect your repository**:
   - Choose your Git provider (GitHub, GitLab, Bitbucket)
   - Select the repository containing this project
   - Choose the branch you want to deploy (usually `main` or `master`)

3. **Configure the service**:
   - **Name**: `illinois-hammer-ai-intake` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node app.js`
   - **Plan**: Choose based on your needs:
     - **Free**: 750 hours/month, suitable for testing
     - **Starter**: $7/month, always running
     - **Standard**: $25/month, better performance

### 3. Configure Environment Variables

Click on the "Environment" tab and add the following variables:

```bash
# Required: Your OnRender domain (replace with your actual domain)
SERVER=your-app-name.onrender.com

# Required: OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# Required: Deepgram API Key  
DEEPGRAM_API_KEY=your-deepgram-api-key-here

# Optional: Twilio credentials for testing
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
FROM_NUMBER='+12223334444'
TO_NUMBER='+13334445555'

# Optional: Enable call recording
RECORDING_ENABLED=false

# Optional: Eleven Labs for alternative TTS
# XI_API_KEY=your-eleven-labs-api-key
# XI_MODEL_ID=eleven_monolingual_v1
```

### 4. Deploy

Click "Create Web Service" and OnRender will:
1. Build your application
2. Install dependencies
3. Start the service
4. Provide you with a URL (e.g., `https://your-app-name.onrender.com`)

### 5. Configure Twilio

1. **Update your Twilio phone number webhook**:
   - Go to [Twilio Console](https://console.twilio.com)
   - Navigate to Phone Numbers → Manage → Active numbers
   - Click on your phone number
   - Set the webhook URL to: `https://your-app-name.onrender.com/incoming`
   - Save the configuration

2. **Test the connection**:
   - Call your Twilio number
   - You should hear: "Thank you for calling The Illinois Hammer. Are you calling about a new case?"

## Troubleshooting

### Common Issues

1. **Build fails**: Check that all dependencies are in `package.json`
2. **Service won't start**: Verify the start command is `node app.js`
3. **Environment variables not working**: Make sure they're added in the OnRender dashboard
4. **Twilio webhook not working**: Ensure the URL is correct and includes `/incoming`

### Health Check

Your service includes a health check endpoint at `/`. You can visit:
`https://your-app-name.onrender.com/`

You should see:
```json
{
  "status": "ok",
  "message": "The Illinois Hammer AI Intake System is running",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Logs

View your application logs in the OnRender dashboard:
1. Go to your service
2. Click on "Logs" tab
3. Monitor for any errors or issues

## Cost Considerations

- **Free Plan**: 750 hours/month (about 31 days)
- **Starter Plan**: $7/month, always running
- **Standard Plan**: $25/month, better performance

For production use, consider the Starter or Standard plan to ensure your service is always available.

## Security Notes

- Never commit your `.env` file to your repository
- Use OnRender's environment variables for all sensitive data
- Regularly rotate your API keys
- Monitor your usage to avoid unexpected charges 
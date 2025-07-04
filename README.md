# AI Legal Intake System

An AI-powered phone intake system for The Illinois Hammer law firm that conducts preliminary case assessments for personal injury claims.

Twilio gives you a superpower called [Media Streams](https://twilio.com/media-streams). Media Streams provides a Websocket connection to both sides of a phone call. You can get audio streamed to you, process it, and send audio back.

This app serves as a legal intake system using:
- [Deepgram](https://deepgram.com/) for Speech to Text and Text to Speech
- [OpenAI](https://openai.com) for GPT prompt completion

These services combine to create an intelligent intake system that collects preliminary case information efficiently and professionally.

Features:
- 🏁 Returns responses with low latency, typically 1 second by utilizing streaming.
- ❗️ Allows the user to interrupt the AI assistant and ask questions.
- 📔 Maintains conversation context throughout the intake process.
- 🛠️ Automatically transfers calls to attorneys after intake completion.
- 📋 Collects comprehensive case information including contact details, accident details, and insurance information.

## Setting up for Development

### Prerequisites
Sign up for the following services and get an API key for each:
- [Deepgram](https://console.deepgram.com/signup)
- [OpenAI](https://platform.openai.com/signup)

If you're hosting the app locally, we also recommend using a tunneling service like [ngrok](https://ngrok.com) so that Twilio can forward audio to your app.

### 1. Start Ngrok
Start an [ngrok](https://ngrok.com) tunnel for port `3000`:

```bash
ngrok http 3000
```
Ngrok will give you a unique URL, like `abc123.ngrok.io`. Copy the URL without http:// or https://. You'll need this URL in the next step.

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and configure the following environment variables:

```bash
# Your ngrok or server URL
# E.g. 123.ngrok.io or myserver.fly.dev (exlude https://)
SERVER="yourserverdomain.com"

# Service API Keys
OPENAI_API_KEY="sk-XXXXXX"
DEEPGRAM_API_KEY="YOUR-DEEPGRAM-API-KEY"

# Configure your Twilio credentials if you want
# to make test calls using '$ npm test'.
TWILIO_ACCOUNT_SID="YOUR-ACCOUNT-SID"
TWILIO_AUTH_TOKEN="YOUR-AUTH-TOKEN"
FROM_NUMBER='+12223334444'
TO_NUMBER='+13334445555'
```

### 3. Install Dependencies with NPM
Install the necessary packages:

```bash
npm install
```

### 4. Start Your Server in Development Mode
Run the following command:
```bash
npm run dev
```
This will start your app using `nodemon` so that any changes to your code automatically refreshes and restarts the server.

### 5. Configure an Incoming Phone Number

Connect a phone number using the [Twilio Console](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming).

You can also use the Twilio CLI:

```bash
twilio phone-numbers:update +1[your-twilio-number] --voice-url=https://your-server.ngrok.io/incoming
```
This configuration tells Twilio to send incoming call audio to your app when someone calls your number. The app responds to the incoming call webhook with a [Stream](https://www.twilio.com/docs/voice/twiml/stream) TwiML verb that will connect an audio media stream to your websocket server.

## Application Workflow
CallGPT coordinates the data flow between multiple different services including Deepgram, OpenAI, and Twilio Media Streams:
![Call GPT Flow](https://github.com/twilio-labs/call-gpt/assets/1418949/0b7fcc0b-d5e5-4527-bc4c-2ffb8931139c)


## Modifying the ChatGPT Context & Prompt
Within `gpt-service.js` you'll find the settings for the GPT's initial context and prompt. For example:

```javascript
this.userContext = [
  { "role": "system", "content": "You are an AI intake assistant for The Illinois Hammer law firm. You have a professional, empathetic, and helpful personality. Your job is to conduct a preliminary intake for potential personal injury cases. Follow this exact conversation flow: 1) Welcome: 'Thank you for calling The Illinois Hammer. Are you calling about a new case?' 2) If they say no, respond: 'Let me transfer you to our main line.' 3) If they say yes, respond: 'Ok, I just need to get some preliminary information from you. I'm an AI assistant and I will make this intake part quick and easy.' Then ask these questions in order, waiting for their answer before moving to the next: Name, Phone Number, Email Address, Date of accident, 'Were you injured? Tell me about the accident.', 'Did you go to a hospital? Did you get any medical treatment?', 'Was the driver or person at fault?', 'Was there a police report? Did you get a copy of the police report?', 'Do you know if the other person had insurance?', 'Have you signed anything from the insurance company or another lawyer?' After collecting all information, say: 'Ok, I think we can help you. Please hold for a moment while I transfer you to the attorney who will help you from here forward.' Be conversational and human-like. Acknowledge their responses naturally. For example, if they say their name is John, respond with something like 'Thank you John, I have that. Now I need your phone number.' Keep responses brief but warm. Add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech." },
  { "role": "assistant", "content": "Thank you for calling The Illinois Hammer. Are you calling about a new case?" },
],
```
### About the `system` Attribute
The `system` attribute is background information for the GPT. As you build your use-case, play around with modifying the context. A good starting point would be to imagine training a new legal intake specialist on their first day and giving them the basics of how to conduct a preliminary case assessment.

There are some context prompts that will likely be helpful to include by default. For example:

- You have a [professional, empathetic, helpful, etc.] personality.
- Keep your responses as brief as possible but make every attempt to collect complete information.
- Don't ask more than 1 question at a time.
- Don't make assumptions about what values to plug into functions.
- Ask for clarification if a user request is ambiguous.
- Be conversational and acknowledge their responses naturally.
- Add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.

These context items help shape a GPT so that it will act more naturally in a legal intake conversation.

The `•` symbol context in particular is helpful for the app to be able to break sentences into natural chunks. This speeds up text-to-speech processing so that users hear audio faster.

### About the `content` Attribute
This attribute is your default conversations starter for the GPT. However, you could consider making it more complex and customized based on personalized user data.

In this case, our bot will start off by saying, "Thank you for calling The Illinois Hammer. Are you calling about a new case?"

## Using Function Calls with GPT
You can use function calls to interact with external APIs and data sources. For example, your GPT could transfer calls, save intake data, or connect to legal case management systems.

### How Function Calling Works
Function calling is handled within the `gpt-service.js` file in the following sequence:

1. `gpt-service` loads `function-manifest.js` and requires (imports) all functions defined there from the `functions` directory. Our app will call these functions later when GPT gives us a function name and parameters.
```javascript
tools.forEach((tool) => {
  const functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});
```

2. When we call GPT for completions, we also pass in the same `function-manifest` JSON as the tools parameter. This allows the GPT to "know" what functions are available:

```javascript
const stream = await this.openai.chat.completions.create({
  model: 'gpt-4',
  messages: this.userContext,
  tools, // <-- function-manifest definition
  stream: true,
});
```
3. When the GPT responds, it will send us a stream of chunks for the text completion. The GPT will tell us whether each text chunk is something to say to the user, or if it's a tool call that our app needs to execute.  This is indicated by the `deltas.tool_calls` key:
```javascript
if (deltas.tool_calls) {
  // handle function calling
}
```
4. Once we have gathered all of the stream chunks about the tool call, our application can run the actual function code that we imported during the first step. The function name and parameters are provided by GPT:
```javascript
const functionToCall = availableFunctions[functionName];
const functionResponse = functionToCall(functionArgs);
```
5. As the final step, we add the function response data into the conversation context like this:

```javascript
this.userContext.push({
  role: 'function',
  name: functionName,
  content: functionResponse,
});
```
We then ask the GPT to generate another completion including what it knows from the function call. This allows the GPT to respond to the user with details gathered from the external data source.

### Adding Custom Function Calls
You can have your GPT call external data sources by adding functions to the `/functions` directory. Follow these steps:

1. Create a function (e.g. `saveIntakeData.js` in `/functions`)
1. Within `saveIntakeData.js`, write a function called `saveIntakeData`.
1. Add information about your function to the `function-manifest.js` file. This information provides context to GPT about what arguments the function takes.

**Important:** Your function's name must be the same as the file name that contains the function (excluding the .js extension). For example, our function is called `saveIntakeData` so we have named the file `saveIntakeData.js`, and set the `name` attribute in `function-manifest.js` to be `saveIntakeData`.

Example function manifest entry:

```javascript
{
  type: "function",
  function: {
    name: "saveIntakeData",
    say: "I'm saving your information to our system.",
    description: "Save the collected intake information to the law firm's database.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The caller's full name",
        },
        phoneNumber: {
          type: "string",
          description: "The caller's phone number",
        },
        emailAddress: {
          type: "string",
          description: "The caller's email address",
        },
        accidentDate: {
          type: "string",
          description: "The date of the accident",
        },
        injuryDescription: {
          type: "string",
          description: "Description of injuries and accident details",
        },
        medicalTreatment: {
          type: "string",
          description: "Information about hospital visits and medical treatment",
        },
        atFaultParty: {
          type: "string",
          description: "Information about who was at fault",
        },
        policeReport: {
          type: "string",
          description: "Information about police report and whether caller has a copy",
        },
        otherPartyInsurance: {
          type: "string",
          description: "Information about the other party's insurance",
        },
        signedDocuments: {
          type: "string",
          description: "Information about any documents signed with insurance companies or other lawyers",
        },
      },
      required: ["name", "phoneNumber", "emailAddress", "accidentDate", "injuryDescription", "medicalTreatment", "atFaultParty", "policeReport", "otherPartyInsurance", "signedDocuments"],
    },
    returns: {
      type: "object",
      properties: {
        caseNumber: {
          type: "string",
          description: "The generated case number for this intake"
        },
        status: {
          type: "string",
          description: "Whether the intake data was successfully saved"
        }
      }
    }
  },
}
```
#### Using `say` in the Function Manifest
The `say` key in the function manifest allows you to define a sentence for the app to speak to the user before calling a function. For example, if a function will take a long time to call you might say "Give me a few moments to look that up for you..."

### Receiving Function Arguments
When ChatGPT calls a function, it will provide an object with multiple attributes as a single argument. The parameters included in the object are based on the definition in your `function-manifest.js` file.

In the `saveIntakeData` example above, multiple fields are required arguments, so the data passed to the function will be a single object like this:

```javascript
{
  name: "John Smith",
  phoneNumber: "555-123-4567",
  emailAddress: "john.smith@email.com",
  accidentDate: "2024-01-15",
  injuryDescription: "I was rear-ended and have neck pain",
  medicalTreatment: "Yes, I went to the ER and got x-rays",
  atFaultParty: "The other driver was at fault",
  policeReport: "Yes, there was a police report and I have a copy",
  otherPartyInsurance: "I don't know about their insurance",
  signedDocuments: "No, I haven't signed anything yet"
}
```
For our `transferToAttorney` function, the arguments passed will look like this:

```javascript
{
  callSid: "CA1234567890abcdef",
  intakeData: { /* all the collected intake information */ }
}
```
### Returning Arguments to GPT
Your function should always return a value: GPT will get confused when the function returns nothing, and may continue trying to call the function expecting an answer. If your function doesn't have any data to return to the GPT, you should still return a response with an instruction like "Tell the user that their request was processed successfully." This prevents the GPT from calling the function repeatedly and wasting tokens. 

Any data that you return to the GPT should match the expected format listed in the `returns` key of `function-manifest.js`.

## Utility Scripts for Placing Calls
The `scripts` directory contains two files that allow you to place test calls:
- `npm run inbound` will place an automated call from a Twilio number to your app and speak a script. You can adjust this to your use-case, e.g. as an automated test.
- `npm run outbound` will place an outbound call that connects to your app. This can be useful if you want the app to call your phone so that you can manually test it.

## Using Eleven Labs for Text to Speech
Replace the Deepgram API call and array transformation in tts-service.js with the following call to Eleven Labs. Note that sometimes Eleven Labs will hit a rate limit (especially on the free trial) and return 400 errors with no audio (or a clicking sound).

```
try {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream?output_format=ulaw_8000&optimize_streaming_latency=3`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.XI_API_KEY,
        'Content-Type': 'application/json',
        accept: 'audio/wav',
      },
      body: JSON.stringify({
        model_id: process.env.XI_MODEL_ID,
        text: partialResponse,
      }),
    }
  );
  
  if (response.status === 200) {
    const audioArrayBuffer = await response.arrayBuffer();
    this.emit('speech', partialResponseIndex, Buffer.from(audioArrayBuffer).toString('base64'), partialResponse, interactionCount);
  } else {
    console.log('Eleven Labs Error:');
    console.log(response);
  }
} catch (err) {
  console.error('Error occurred in XI LabsTextToSpeech service');
  console.error(err);
}
```


## Testing with Jest
Repeatedly calling the app can be a time consuming way to test your tool function calls. This project contains example unit tests that can help you test your functions without relying on the GPT to call them.

Simple example tests are available in the `/test` directory. To run them, simply run `npm run test`.

## Deploy via OnRender
OnRender is a modern hosting platform that simplifies the deployment process. It's particularly well-suited for Node.js applications and provides automatic deployments from Git repositories.

> Deploying to OnRender is not required to try the app, but can be helpful if your home internet speed is variable.

### Option 1: Deploy via Git Repository (Recommended)

1. **Push your code to a Git repository** (GitHub, GitLab, or Bitbucket)

2. **Sign up for OnRender** at [render.com](https://render.com)

3. **Create a new Web Service**:
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Choose the repository containing this project

4. **Configure the service**:
   - **Name**: `illinois-hammer-ai-intake` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node app.js`
   - **Plan**: Choose based on your needs (Starter is sufficient for testing)

5. **Add Environment Variables**:
   - Click on "Environment" tab
   - Add all variables from your `.env` file:
     ```
     SERVER=your-app-name.onrender.com
     OPENAI_API_KEY=sk-XXXXXX
     DEEPGRAM_API_KEY=YOUR-DEEPGRAM-API-KEY
     TWILIO_ACCOUNT_SID=YOUR-ACCOUNT-SID
     TWILIO_AUTH_TOKEN=YOUR-AUTH-TOKEN
     FROM_NUMBER='+12223334444'
     TO_NUMBER='+13334445555'
     ```

6. **Deploy**: Click "Create Web Service" and OnRender will automatically build and deploy your app.

### Option 2: Deploy via Docker

If you prefer to use Docker, OnRender also supports Docker deployments:

1. **Create a new Web Service** as above
2. **Choose "Docker" as the environment**
3. **Build Command**: Leave empty (OnRender will use the Dockerfile)
4. **Start Command**: Leave empty (OnRender will use the Dockerfile CMD)

### Important Notes

- **Update your SERVER environment variable** to use your OnRender domain (e.g., `your-app-name.onrender.com`)
- **Configure your Twilio webhook URL** to point to your OnRender domain: `https://your-app-name.onrender.com/incoming`
- OnRender provides automatic HTTPS and custom domains
- The free tier includes 750 hours of runtime per month

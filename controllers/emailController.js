const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const config = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  },
  checkInterval: 5 * 60 * 1000,
  maxRetries: 5,
  retryDelay: 10000
};

let retryCount = 0;
let imap;
let intervalId;

function initialize() {
  initializeImap();
  startPeriodicChecker();
}

function shutdown() {
  if (imap) imap.end();
  if (intervalId) clearInterval(intervalId);
}

function initializeImap() {
  imap = new Imap(config.imap);

  imap.once('ready', function() {
    retryCount = 0;
    openInbox((err, box) => {
      if (err) {
        console.error('❌ Error opening inbox:', err);
        return;
      }
      checkUnseenEmails();
    });
  });

  imap.on('mail', function(numNewMsgs) {
    console.log(`📨 New mail event: ${numNewMsgs} new message(s)`);
    checkUnseenEmails();
  });

  imap.once('error', err => {
    console.error('❌ IMAP error:', err);
    handleImapError(err);
  });

  imap.once('end', () => {
    console.log('🔌 IMAP connection ended');
    setTimeout(initializeImap, config.retryDelay);
  });

  console.log('🔗 Connecting to IMAP server...');
  imap.connect();
}

function openInbox(cb) {
  imap.openBox('INBOX', false, cb);
}

function checkUnseenEmails() {
  imap.search(['UNSEEN'], (err, results) => {
    if (err) {
      console.error('❌ Error searching for unseen emails:', err);
      return;
    }
    
    if (results && results.length) {
      console.log(`📬 Found ${results.length} unseen message(s)`);
      processMessages(results);
    }
  });
}

function processMessages(messageIds) {
  const f = imap.fetch(messageIds, { bodies: '', markSeen: true });

  f.on('message', function(msg, seqno) {
    let buffer = '';
    
    msg.on('body', function(stream, info) {
      stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
      stream.once('end', () => {
        simpleParser(buffer, async (err, parsed) => {
          if (err) {
            console.error('❌ Parsing error:', err);
            return;
          }

          const sender = parsed.from?.value?.[0]?.address;
          const subject = parsed.subject || 'No subject';
          const text = parsed.text || '';
          const html = parsed.html || '';

          console.log(`📧 Received email from: ${sender} | Subject: ${subject}`);

          if (sender === 'greatattai442442@gmail.com') {
            console.log('✅ Valid sender found - generating smart reply...');
            try {
              const aiResponse = await generateAIResponse({
                sender,
                subject,
                text,
                html
              });
              await sendReply(sender, subject, aiResponse);
            } catch (error) {
              console.error('❌ Reply failed:', error);
            }
          }
        });
      });
    });
  });
}

async function generateAIResponse(emailData) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an AI email assistant. Generate a professional and concise response to the following email.
          Guidelines:
          1. Be polite and professional
          2. Keep responses brief (1-3 sentences)
          3. Address the sender by name if available
          4. Answer any direct questions
          5. If the email requires action, acknowledge it
          6. Sign off appropriately`
        },
        {
          role: 'user',
          content: `Respond to this email:
          
          From: ${emailData.sender}
          Subject: ${emailData.subject}
          
          ${emailData.text.substring(0, 2000)}`
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    if (!response?.choices?.[0]?.message?.content) {
      throw new Error('No response from OpenAI');
    }

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI response generation failed:', error);
    return "Thank you for your email. I've received it and will get back to you soon.";
  }
}

async function sendReply(to, originalSubject, responseText) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: `"AI Email Assistant" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: `Re: ${originalSubject}`,
    text: responseText,
    html: `<p>${responseText.replace(/\n/g, '<br>')}</p>`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Smart confirmation sent to ${to}`);
    return info;
  } catch (error) {
    console.error('❌ Failed to send confirmation:', error);
    throw error;
  }
}

function handleImapError(err) {
  retryCount++;
  if (retryCount <= config.maxRetries) {
    console.log(`🔄 Attempting to reconnect (${retryCount}/${config.maxRetries})...`);
    setTimeout(initializeImap, config.retryDelay);
  } else {
    console.error('❌ Maximum retry attempts reached. Exiting...');
    process.exit(1);
  }
}

function startPeriodicChecker() {
  intervalId = setInterval(() => {
    if (imap && imap.state === 'authenticated') {
      console.log('⏰ Periodic check for new emails...');
      checkUnseenEmails();
    }
  }, config.checkInterval);
}

module.exports = {
  initialize,
  shutdown
};
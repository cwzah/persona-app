import { useState, useRef, useEffect } from 'react';

// Encode/decode persona to URL-safe string
function encodePersona(persona) {
  return btoa(encodeURIComponent(JSON.stringify(persona)));
}

function decodePersona(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [persona, setPersona] = useState(null);
  const [shareUrl, setShareUrl] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const messagesEndRef = useRef(null);

  // Check URL for persona on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('p');
    if (encoded) {
      const decoded = decodePersona(encoded);
      if (decoded) {
        setPersona(decoded);
        setScreen('chat');
      }
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-AU';

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        setTranscript(finalTranscript || interimTranscript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Request microphone permission
  const requestMicPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (err) {
      return false;
    }
  };

  // Speak text using speech synthesis
  const speak = (text) => {
    return new Promise((resolve) => {
      if (!synthRef.current) {
        resolve();
        return;
      }

      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      const voices = synthRef.current.getVoices();
      const preferredVoice = voices.find(v => 
        v.name.includes('Samantha') || 
        v.name.includes('Karen') ||
        v.name.includes('Google') ||
        v.name.includes('Natural')
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };

      synthRef.current.speak(utterance);
    });
  };

  // Start listening
  const startListening = async () => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        alert('Microphone access required');
        return;
      }
      setTranscript('');
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Recognition start error:', e);
        setIsListening(false);
      }
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  // Start onboarding
  const startOnboarding = async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      alert('Microphone access is required for voice interview');
      return;
    }

    setScreen('onboarding');
    setMessages([]);
    setIsLoading(true);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are conducting a voice interview to create someone's digital persona. Have a warm, natural conversation.

IMPORTANT: Keep responses SHORT - 1-2 sentences max. This is voice, not text.

Ask ONE question at a time. Cover across 6-8 exchanges:
- Name and what they do
- Where they're from
- What they're passionate about  
- An interesting story
- Their views on something they care about
- How they'd describe themselves

After 6-8 exchanges, end with "[READY]" on its own line.

Start with a brief greeting and ask their name.`,
          messages: [{ role: 'user', content: 'Hi, I want to create my AI persona.' }]
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || "Hey! Great to meet you. What's your name?";
      const cleanText = text.replace('[READY]', '').trim();
      
      setMessages([
        { role: 'user', content: 'Hi, I want to create my AI persona.' },
        { role: 'assistant', content: cleanText }
      ]);
      
      setIsLoading(false);
      await speak(cleanText);
      
    } catch (error) {
      const fallbackText = "Hey! Great to meet you. What's your name?";
      setMessages([
        { role: 'user', content: 'Hi, I want to create my AI persona.' },
        { role: 'assistant', content: fallbackText }
      ]);
      setIsLoading(false);
      await speak(fallbackText);
    }
  };

  // Send spoken message
  const sendSpokenMessage = async () => {
    if (!transcript.trim() || isLoading || isSpeaking) return;
    
    const userMessage = transcript.trim();
    setTranscript('');
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are conducting a voice interview to create someone's digital persona. Have a warm, natural conversation.

IMPORTANT: Keep responses SHORT - 1-2 sentences max. This is voice, not text.

Ask ONE question at a time. Cover across 6-8 exchanges:
- Name and what they do
- Where they're from
- What they're passionate about  
- An interesting story
- Their views on something they care about
- How they'd describe themselves

After 6-8 exchanges, end with "[READY]" on its own line.`,
          messages: newMessages
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Tell me more about that.";
      const cleanText = text.replace('[READY]', '').trim();
      
      const updatedMessages = [...newMessages, { role: 'assistant', content: cleanText }];
      setMessages(updatedMessages);
      setIsLoading(false);

      if (text.includes('[READY]')) {
        setOnboardingComplete(true);
        await speak(cleanText);
        setTimeout(() => generatePersona(updatedMessages), 1000);
      } else {
        await speak(cleanText);
      }
    } catch (error) {
      const fallbackText = "That's interesting. Tell me more.";
      setMessages(prev => [...prev, { role: 'assistant', content: fallbackText }]);
      setIsLoading(false);
      await speak(fallbackText);
    }
  };

  // Generate persona
  const generatePersona = async (conversation) => {
    setIsLoading(true);
    await speak("Perfect, I've got a good sense of who you are. Give me a moment.");
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `Create a persona profile from this conversation. Return ONLY valid JSON:
{
  "name": "their name",
  "tagline": "short description",
  "background": "background info",
  "passions": ["passions"],
  "personality": "personality",
  "stories": ["stories"],
  "perspectives": ["views"],
  "style": "communication style"
}`,
          messages: [...conversation, { role: 'user', content: 'Create my persona profile.' }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const personaData = JSON.parse(jsonMatch[0]);
        const encoded = encodePersona(personaData);
        const url = `${window.location.origin}${window.location.pathname}?p=${encoded}`;
        
        setPersona(personaData);
        setShareUrl(url);
        setScreen('complete');
      }
    } catch (error) {
      console.error('Error:', error);
    }
    setIsLoading(false);
  };

  // Chat with persona
  const sendChatMessage = async () => {
    if (!transcript.trim() || isLoading || isSpeaking) return;
    
    const userMessage = transcript.trim();
    setTranscript('');
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You ARE ${persona.name}. Respond as this person in voice conversation. Keep it brief.

${persona.tagline}
Background: ${persona.background}
Passions: ${persona.passions?.join(', ')}
Personality: ${persona.personality}
Style: ${persona.style}

Never say you're an AI. You are ${persona.name}.`,
          messages: newMessages
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Hmm, let me think about that.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      setIsLoading(false);
      await speak(text);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, what was that?" }]);
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('Link copied!');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: "'Crimson Pro', Georgia, serif",
      color: '#e8e6e3'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        
        * { box-sizing: border-box; }
        
        .glow { box-shadow: 0 0 60px rgba(99, 102, 241, 0.15); }
        
        .btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: none;
          padding: 16px 32px;
          color: white;
          font-family: 'Space Mono', monospace;
          font-size: 14px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          border-radius: 8px;
        }
        
        .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 40px rgba(79, 70, 229, 0.4); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        
        .btn-secondary {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        .mic-btn {
          width: 140px;
          height: 140px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 56px;
          padding: 0;
        }
        
        .mic-btn.listening {
          animation: pulse-ring 1.5s ease-out infinite;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 40px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        
        .wave {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 60px;
        }
        
        .wave span {
          width: 6px;
          background: #7c3aed;
          border-radius: 3px;
          animation: wave 0.6s ease-in-out infinite alternate;
        }
        
        .wave span:nth-child(1) { height: 20px; animation-delay: 0s; }
        .wave span:nth-child(2) { height: 35px; animation-delay: 0.1s; }
        .wave span:nth-child(3) { height: 50px; animation-delay: 0.2s; }
        .wave span:nth-child(4) { height: 35px; animation-delay: 0.3s; }
        .wave span:nth-child(5) { height: 20px; animation-delay: 0.4s; }
        
        @keyframes wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.2); }
        }
      `}</style>

      {/* Landing */}
      {screen === 'landing' && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '12px',
            letterSpacing: '4px',
            fontFamily: "'Space Mono', monospace",
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '24px',
            textTransform: 'uppercase'
          }}>
            Digital Persona
          </div>
          
          <h1 style={{
            fontSize: 'clamp(42px, 10vw, 72px)',
            fontWeight: '300',
            margin: '0 0 24px 0',
            lineHeight: '1.1',
            background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Your AI.<br/>Your Voice.
          </h1>
          
          <p style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '400px',
            marginBottom: '48px',
            lineHeight: '1.6'
          }}>
            A 2-minute voice conversation creates an AI that speaks as you.
          </p>

          <button className="btn" onClick={startOnboarding}>
            🎤 Start Interview
          </button>
        </div>
      )}

      {/* Onboarding */}
      {screen === 'onboarding' && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '12px',
            letterSpacing: '3px',
            fontFamily: "'Space Mono', monospace",
            color: isSpeaking ? '#7c3aed' : isListening ? '#ef4444' : 'rgba(255,255,255,0.4)',
            marginBottom: '32px',
            textTransform: 'uppercase'
          }}>
            {isSpeaking ? '🔊 Speaking...' : isListening ? '🎤 Listening...' : isLoading ? '⏳ Thinking...' : '👆 Tap mic to respond'}
          </div>

          {/* AI speaking animation */}
          {isSpeaking && (
            <div className="wave" style={{ marginBottom: '32px' }}>
              <span /><span /><span /><span /><span />
            </div>
          )}

          {/* Last message or transcript */}
          <div style={{
            fontSize: '22px',
            color: 'rgba(255,255,255,0.8)',
            maxWidth: '500px',
            marginBottom: '40px',
            minHeight: '80px',
            lineHeight: '1.5'
          }}>
            {transcript || (messages.length > 1 && !isSpeaking ? messages[messages.length - 1].content : '')}
          </div>

          {!onboardingComplete && (
            <>
              <button
                className={`btn mic-btn ${isListening ? 'listening' : ''}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isSpeaking || isLoading}
              >
                🎤
              </button>

              {transcript && !isListening && (
                <button
                  className="btn"
                  onClick={sendSpokenMessage}
                  disabled={isLoading || isSpeaking}
                  style={{ marginTop: '24px' }}
                >
                  Send ➤
                </button>
              )}
            </>
          )}

          {onboardingComplete && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '18px' }}>
              Building your persona...
            </div>
          )}
        </div>
      )}

      {/* Complete */}
      {screen === 'complete' && persona && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <div className="glow" style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '24px',
            padding: '48px',
            maxWidth: '450px',
            width: '100%'
          }}>
            <div style={{
              fontSize: '11px',
              letterSpacing: '3px',
              fontFamily: "'Space Mono', monospace",
              color: '#7c3aed',
              marginBottom: '16px',
              textTransform: 'uppercase'
            }}>
              ✓ Persona Created
            </div>
            
            <h2 style={{ fontSize: '32px', fontWeight: '400', margin: '0 0 8px 0' }}>
              {persona.name}
            </h2>
            
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', margin: '0 0 32px 0' }}>
              {persona.tagline}
            </p>

            <button 
              className="btn" 
              onClick={copyToClipboard}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              📋 Copy Share Link
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={() => { setMessages([]); setScreen('chat'); }}
              style={{ width: '100%', marginBottom: '24px' }}
            >
              🎤 Test Voice Chat
            </button>

            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              Share the link - anyone can voice chat with your AI
            </p>
          </div>
        </div>
      )}

      {/* Chat */}
      {screen === 'chat' && persona && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              synthRef.current?.cancel();
              window.history.pushState({}, '', window.location.pathname);
              setScreen('landing');
              setMessages([]);
              setPersona(null);
            }}
            style={{ position: 'fixed', top: '20px', right: '20px', padding: '10px 16px', fontSize: '11px' }}
          >
            Exit
          </button>

          <h2 style={{ fontSize: '24px', fontWeight: '400', margin: '0 0 4px 0' }}>
            {persona.name}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>
            {persona.tagline}
          </p>

          {isSpeaking && (
            <div className="wave" style={{ marginBottom: '24px' }}>
              <span /><span /><span /><span /><span />
            </div>
          )}

          <div style={{
            fontSize: '20px',
            color: 'rgba(255,255,255,0.8)',
            maxWidth: '450px',
            marginBottom: '32px',
            minHeight: '60px',
            lineHeight: '1.5'
          }}>
            {transcript || (messages.length > 0 ? messages[messages.length - 1].content : `Talk to ${persona.name}`)}
          </div>

          <button
            className={`btn mic-btn ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isSpeaking || isLoading}
          >
            🎤
          </button>

          {transcript && !isListening && (
            <button
              className="btn"
              onClick={sendChatMessage}
              disabled={isLoading || isSpeaking}
              style={{ marginTop: '24px' }}
            >
              Send ➤
            </button>
          )}
        </div>
      )}
    </div>
  );
}

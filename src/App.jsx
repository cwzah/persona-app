import { useState, useRef, useEffect } from 'react';

// Encode/decode persona for URL sharing
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
  const [textInput, setTextInput] = useState('');
  const [useTextMode, setUseTextMode] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(true);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef(null);
  const synthRef = useRef(null);

  // Add debug message
  const log = (msg) => {
    console.log(msg);
    setDebugLog(prev => [...prev.slice(-15), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Check for persona in URL or localStorage on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('p');
    
    if (encoded) {
      // Someone else's persona from URL - go to chat
      const decoded = decodePersona(encoded);
      if (decoded) {
        setPersona(decoded);
        setScreen('chat');
        log('Loaded persona from URL');
      }
    } else {
      // Check localStorage for your own persona
      const savedPersona = localStorage.getItem('myPersona');
      const savedUrl = localStorage.getItem('myPersonaUrl');
      if (savedPersona) {
        try {
          const parsed = JSON.parse(savedPersona);
          setPersona(parsed);
          setShareUrl(savedUrl || '');
          setScreen('complete');
          log('Loaded your persona from localStorage');
        } catch (e) {
          log('Failed to load saved persona');
        }
      }
    }
  }, []);

  // Initialize speech synthesis and get voices
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    synthRef.current = window.speechSynthesis;
    
    const loadVoices = () => {
      const v = synthRef.current.getVoices();
      log(`Found ${v.length} voices`);
      setVoices(v);
      
      // Pick a good default voice
      const preferred = v.find(voice => 
        voice.name.includes('Samantha') ||
        voice.name.includes('Karen') ||
        voice.name.includes('Daniel') ||
        voice.name.includes('Google UK')
      ) || v.find(voice => voice.lang.startsWith('en')) || v[0];
      
      if (preferred) {
        setSelectedVoice(preferred);
        log(`Selected voice: ${preferred.name}`);
      }
    };

    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      log('Speech recognition NOT supported');
      setSpeechSupported(false);
      setUseTextMode(true);
      return;
    }

    log('Initializing speech recognition...');
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      log('Recognition started - listening...');
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
          log(`Final: "${result[0].transcript}" (confidence: ${Math.round(result[0].confidence * 100)}%)`);
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
      } else if (interimTranscript) {
        setTranscript(interimTranscript);
        log(`Interim: "${interimTranscript}"`);
      }
    };

    recognition.onerror = (event) => {
      log(`Recognition error: ${event.error}`);
      setIsListening(false);
      
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access and refresh the page.');
      } else if (event.error === 'no-speech') {
        log('No speech detected - try speaking louder');
      }
    };

    recognition.onend = () => {
      log('Recognition ended');
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    log('Speech recognition ready');
  }, []);

  // Text-to-speech
  const speak = (text) => {
    return new Promise((resolve) => {
      if (!synthRef.current || !text) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        log('Speaking...');
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
        log('Done speaking');
        resolve();
      };
      
      utterance.onerror = (e) => {
        log(`Speech error: ${e.error}`);
        setIsSpeaking(false);
        resolve();
      };

      synthRef.current.speak(utterance);
    });
  };

  // Start listening
  const startListening = async () => {
    if (!recognitionRef.current) {
      log('Recognition not available');
      setUseTextMode(true);
      return;
    }

    if (isSpeaking) {
      log('Wait for AI to finish speaking');
      return;
    }

    setTranscript('');
    
    try {
      recognitionRef.current.start();
      log('Started listening');
    } catch (e) {
      log(`Start error: ${e.message}`);
      // If already started, try stopping first
      try {
        recognitionRef.current.stop();
        setTimeout(() => {
          recognitionRef.current.start();
        }, 100);
      } catch (e2) {
        log(`Restart error: ${e2.message}`);
      }
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      log('Stopped listening');
    }
  };

  // Send message (from voice or text)
  const sendMessage = async (messageText) => {
    const text = messageText || transcript || textInput;
    if (!text.trim() || isLoading) return;

    log(`Sending: "${text}"`);
    setTranscript('');
    setTextInput('');
    
    const userMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const isOnboarding = !persona;
      
      const systemPrompt = isOnboarding 
        ? `You are conducting a voice interview to create someone's AI digital twin. Have a warm, natural conversation to deeply understand this person.

RULES:
- Keep responses SHORT (1-2 sentences max) - this is voice, not text
- Ask ONE question at a time
- Acknowledge what they just said before asking the next thing
- Be genuinely curious and warm

Cover these topics over 6-8 exchanges:
- Their name and what they do
- What they're passionate about
- Their personality and communication style
- Interesting stories or experiences
- Their values and perspectives

After 6-8 good exchanges, when you have enough to create a rich persona, end your message with [READY] on its own line.`
        : `You are ${persona.name}'s AI twin. Respond as them in voice conversation.

${persona.tagline || ''}
Background: ${persona.background || ''}
Passions: ${persona.passions?.join(', ') || ''}
Personality: ${persona.personality || ''}
Style: ${persona.style || ''}

Keep responses brief and conversational. Never say you're an AI. You are ${persona.name}.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt,
          messages: newMessages.filter(m => m.role === 'user' || m.role === 'assistant')
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data.content?.[0]?.text || "Sorry, I didn't catch that. Can you try again?";
      
      log(`AI response: "${aiText.substring(0, 50)}..."`);

      const isReady = aiText.includes('[READY]');
      const cleanText = aiText.replace('[READY]', '').trim();

      setMessages([...newMessages, { role: 'assistant', content: cleanText }]);
      setIsLoading(false);

      await speak(cleanText);

      if (isReady && isOnboarding) {
        log('Interview complete - generating persona...');
        setTimeout(() => generatePersona([...newMessages, { role: 'assistant', content: cleanText }]), 1500);
      }

    } catch (error) {
      log(`Error: ${error.message}`);
      setMessages([...newMessages, { role: 'assistant', content: "Sorry, something went wrong. Can you try again?" }]);
      setIsLoading(false);
    }
  };

  // Generate persona from conversation
  const generatePersona = async (conversationHistory) => {
    log('Generating persona...');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `Based on this interview conversation, create a JSON persona profile. Return ONLY valid JSON, no other text.

{
  "name": "their first name",
  "tagline": "one sentence capturing their essence",
  "background": "2-3 sentences about their background",
  "passions": ["3-5 things they care about"],
  "personality": "2-3 sentences about how they communicate and their personality",
  "style": "brief description of their communication style"
}`,
          messages: [...conversationHistory, { 
            role: 'user', 
            content: 'Now create the JSON persona based on our conversation.' 
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      
      const generatedPersona = JSON.parse(jsonMatch[0]);
      log(`Persona created for: ${generatedPersona.name}`);

      setPersona(generatedPersona);
      
      const url = `${window.location.origin}?p=${encodePersona(generatedPersona)}`;
      setShareUrl(url);
      
      // Save to localStorage
      localStorage.setItem('myPersona', JSON.stringify(generatedPersona));
      localStorage.setItem('myPersonaUrl', url);
      log('Persona saved to localStorage');
      
      setScreen('complete');
      setIsLoading(false);

      await speak(`Perfect! I've created your AI persona, ${generatedPersona.name}. You can now share the link so others can talk to your digital twin.`);

    } catch (error) {
      log(`Persona generation error: ${error.message}`);
      setIsLoading(false);
    }
  };

  // Start onboarding interview
  const startOnboarding = async () => {
    setScreen('onboarding');
    setMessages([]);
    setIsLoading(true);
    log('Starting onboarding interview...');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: `You're starting a voice interview to create someone's AI digital twin. Give a warm, brief greeting and ask their name. ONE sentence max.`,
          messages: [{ role: 'user', content: 'Start the interview.' }]
        })
      });

      const data = await response.json();
      const greeting = data.content?.[0]?.text || "Hey! Great to meet you. What's your name?";
      
      setMessages([{ role: 'assistant', content: greeting }]);
      setIsLoading(false);
      log(`Greeting: "${greeting}"`);
      
      await speak(greeting);

    } catch (error) {
      log(`Start error: ${error.message}`);
      const fallback = "Hey! Great to meet you. What's your name?";
      setMessages([{ role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  // Copy share URL
  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    log('URL copied');
  };

  // Render
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #0d0d12 0%, #1a1a2e 50%, #0f172a 100%)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      
      {/* Landing Screen */}
      {screen === 'landing' && (
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: '300',
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Create Your AI Twin
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '40px', fontSize: '1.1rem' }}>
            Have a conversation. We'll create an AI that talks like you.
          </p>

          {voices.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                AI Voice:
              </label>
              <select 
                value={selectedVoice?.name || ''}
                onChange={(e) => setSelectedVoice(voices.find(v => v.name === e.target.value))}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  width: '100%',
                  maxWidth: '300px'
                }}
              >
                {voices.filter(v => v.lang.startsWith('en')).map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <button 
                onClick={() => speak("Hello! This is how I sound.")}
                style={{
                  marginLeft: '10px',
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Test
              </button>
            </div>
          )}

          <button
            onClick={startOnboarding}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              color: 'white',
              padding: '16px 48px',
              fontSize: '1rem',
              fontWeight: '500',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
              transition: 'transform 0.2s'
            }}
          >
            Start Interview →
          </button>

          {!speechSupported && (
            <p style={{ color: '#f59e0b', marginTop: '20px', fontSize: '0.9rem' }}>
              ⚠️ Voice recognition not supported in this browser. Text input will be used.
            </p>
          )}
        </div>
      )}

      {/* Onboarding / Chat Screen */}
      {(screen === 'onboarding' || screen === 'chat') && (
        <div style={{ 
          width: '100%', 
          maxWidth: '600px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Conversation display */}
          <div style={{
            width: '100%',
            maxHeight: '300px',
            overflowY: 'auto',
            marginBottom: '30px',
            padding: '20px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '16px'
          }}>
            {messages.map((msg, i) => (
              <div 
                key={i} 
                style={{
                  marginBottom: '16px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                  textAlign: msg.role === 'user' ? 'right' : 'left'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                  {msg.role === 'user' ? 'You' : (persona?.name || 'AI')}
                </div>
                <div>{msg.content}</div>
              </div>
            ))}
            {isLoading && (
              <div style={{ color: '#64748b', fontStyle: 'italic' }}>Thinking...</div>
            )}
          </div>

          {/* Speaking indicator */}
          {isSpeaking && (
            <div style={{
              display: 'flex',
              gap: '6px',
              marginBottom: '20px',
              alignItems: 'center'
            }}>
              <span style={{ color: '#8b5cf6' }}>🔊 Speaking</span>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#8b5cf6',
                animation: 'pulse 1s infinite'
              }} />
            </div>
          )}

          {/* Current transcript display */}
          {(transcript || isListening) && (
            <div style={{
              width: '100%',
              padding: '16px',
              background: 'rgba(99, 102, 241, 0.1)',
              borderRadius: '12px',
              marginBottom: '20px',
              border: '1px solid rgba(99, 102, 241, 0.3)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#8b5cf6', marginBottom: '4px' }}>
                {isListening ? '🎤 Listening...' : 'Heard:'}
              </div>
              <div style={{ fontSize: '1.1rem' }}>
                {transcript || (isListening ? '...' : '')}
              </div>
            </div>
          )}

          {/* Voice controls */}
          {!useTextMode && speechSupported && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isSpeaking || isLoading}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isListening 
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white',
                  fontSize: '2rem',
                  cursor: isSpeaking || isLoading ? 'not-allowed' : 'pointer',
                  opacity: isSpeaking || isLoading ? 0.5 : 1,
                  boxShadow: isListening 
                    ? '0 0 30px rgba(239, 68, 68, 0.5)' 
                    : '0 8px 32px rgba(99, 102, 241, 0.3)',
                  transition: 'all 0.3s'
                }}
              >
                🎤
              </button>
              
              {transcript && !isListening && (
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || isSpeaking}
                  style={{
                    padding: '16px 32px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '500',
                    borderRadius: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Send →
                </button>
              )}
            </div>
          )}

          {/* Text input fallback */}
          <div style={{ width: '100%', marginBottom: '20px' }}>
            <div 
              onClick={() => setUseTextMode(!useTextMode)}
              style={{ 
                color: '#64748b', 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                marginBottom: '10px',
                textDecoration: 'underline'
              }}
            >
              {useTextMode ? 'Try voice input' : 'Use text instead'}
            </div>
            
            {useTextMode && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type your response..."
                  style={{
                    flex: 1,
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#e2e8f0',
                    fontSize: '1rem'
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!textInput.trim() || isLoading}
                  style={{
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none',
                    color: 'white',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    opacity: !textInput.trim() || isLoading ? 0.5 : 1
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>

          {/* Debug panel */}
          {showDebug && (
            <div style={{
              width: '100%',
              maxHeight: '150px',
              overflowY: 'auto',
              padding: '12px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: '#64748b'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginBottom: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '8px'
              }}>
                <span>Debug Log</span>
                <span 
                  onClick={() => setShowDebug(false)}
                  style={{ cursor: 'pointer' }}
                >
                  ✕
                </span>
              </div>
              {debugLog.map((line, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>{line}</div>
              ))}
            </div>
          )}

          {!showDebug && (
            <button 
              onClick={() => setShowDebug(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#475569',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Show debug
            </button>
          )}
        </div>
      )}

      {/* Complete Screen */}
      {screen === 'complete' && persona && (
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{
            fontSize: '4rem',
            marginBottom: '16px'
          }}>
            ✨
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '400', marginBottom: '8px' }}>
            Meet {persona.name}'s AI Twin
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '30px' }}>
            {persona.tagline}
          </p>

          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '30px',
            textAlign: 'left'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '4px' }}>Background</div>
              <div>{persona.background}</div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '4px' }}>Passions</div>
              <div>{persona.passions?.join(' • ')}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '4px' }}>Personality</div>
              <div>{persona.personality}</div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => {
                setMessages([]);
                setScreen('chat');
              }}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                color: 'white',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Talk to {persona.name}
            </button>
            <button
              onClick={copyUrl}
              style={{
                padding: '14px 28px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#e2e8f0',
                borderRadius: '12px',
                cursor: 'pointer'
              }}
            >
              Copy Share Link
            </button>
          </div>
          
          <button
            onClick={() => {
              localStorage.removeItem('myPersona');
              localStorage.removeItem('myPersonaUrl');
              setPersona(null);
              setShareUrl('');
              setMessages([]);
              setScreen('landing');
            }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Create a new persona
          </button>

          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            fontSize: '0.8rem',
            color: '#64748b',
            wordBreak: 'break-all'
          }}>
            {shareUrl}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

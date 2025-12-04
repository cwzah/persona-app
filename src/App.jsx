import { useState, useRef, useEffect } from 'react';

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
  const [displayMessages, setDisplayMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  
  const conversationRef = useRef([]);
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      if (synthRef.current) {
        const allVoices = synthRef.current.getVoices();
        // Filter to English voices only, prefer Australian/UK/US natural voices
        const englishVoices = allVoices.filter(v => v.lang.startsWith('en'));
        
        // Sort: Australian first, then UK, then US, then others
        englishVoices.sort((a, b) => {
          const order = { 'en-AU': 0, 'en-GB': 1, 'en-US': 2 };
          const aOrder = order[a.lang] ?? 3;
          const bOrder = order[b.lang] ?? 3;
          return aOrder - bOrder;
        });
        
        setVoices(englishVoices.length > 0 ? englishVoices : allVoices);
        
        // Try to find a good default
        const defaultIndex = englishVoices.findIndex(v => 
          v.name.includes('Samantha') || 
          v.name.includes('Daniel') ||
          v.name.includes('Karen') ||
          v.name.includes('Moira') ||
          v.name.includes('Tessa')
        );
        if (defaultIndex >= 0) setSelectedVoiceIndex(defaultIndex);
      }
    };

    loadVoices();
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = loadVoices;
    }
  }, []);

  // Check URL for persona
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

  // Initialize speech recognition with better settings
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; // Keep listening
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-AU';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event) => {
        let final = '';
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setTranscript(final || interim);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current.onerror = (e) => {
        console.log('Speech error:', e.error);
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const speak = (text) => {
    return new Promise((resolve) => {
      if (!synthRef.current || voices.length === 0) {
        resolve();
        return;
      }

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.voice = voices[selectedVoiceIndex];

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };

      synthRef.current.speak(utterance);
    });
  };

  const testVoice = () => {
    if (voices.length > 0) {
      synthRef.current?.cancel();
      const utterance = new SpeechSynthesisUtterance("G'day, how's it going?");
      utterance.voice = voices[selectedVoiceIndex];
      utterance.rate = 0.9;
      synthRef.current?.speak(utterance);
    }
  };

  const startListening = async () => {
    if (!recognitionRef.current || isListening || isSpeaking) return;
    
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setTranscript('');
      setIsListening(true);
      recognitionRef.current.start();
    } catch (e) {
      alert('Microphone access required');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const startOnboarding = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('Microphone access required');
      return;
    }

    conversationRef.current = [{ role: 'user', content: 'Hi, I want to create my AI persona.' }];
    setScreen('onboarding');
    setDisplayMessages([]);
    setIsLoading(true);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You're having a casual voice chat to learn about someone. Keep it natural.

CRITICAL: One short sentence only. This is spoken aloud.

Ask ONE thing at a time. Across 6-8 exchanges, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story
- Something they believe strongly
- How friends describe them

After 6-8 exchanges, add [READY] at the end.

Start by asking their name.`,
          messages: conversationRef.current
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || "Hey! What's your name?";
      const cleanText = text.replace('[READY]', '').trim();
      
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages([{ role: 'assistant', content: cleanText }]);
      setIsLoading(false);
      await speak(cleanText);
      
    } catch (error) {
      const fallback = "Hey! What's your name?";
      conversationRef.current.push({ role: 'assistant', content: fallback });
      setDisplayMessages([{ role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  const sendMessage = async () => {
    if (!transcript.trim() || isLoading || isSpeaking) return;
    
    const userMessage = transcript.trim();
    setTranscript('');
    
    conversationRef.current.push({ role: 'user', content: userMessage });
    setDisplayMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const systemPrompt = screen === 'onboarding' 
      ? `You're having a casual voice chat to learn about someone. Keep it natural.

CRITICAL: One short sentence only. This is spoken aloud.

Ask ONE thing at a time. Across 6-8 exchanges, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story
- Something they believe strongly
- How friends describe them

After 6-8 exchanges, add [READY] at the end.`
      : `You ARE ${persona.name}. Speak as them. One or two sentences max.

${persona.tagline}
Background: ${persona.background}
Passions: ${persona.passions?.join(', ')}
Personality: ${persona.personality}

Never say you're an AI.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: conversationRef.current
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Tell me more.";
      const cleanText = text.replace('[READY]', '').trim();
      
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
      setIsLoading(false);

      if (text.includes('[READY]')) {
        setOnboardingComplete(true);
        await speak(cleanText);
        generatePersona();
      } else {
        await speak(cleanText);
      }
    } catch (error) {
      const fallback = "Sorry, say that again?";
      conversationRef.current.push({ role: 'assistant', content: fallback });
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  const generatePersona = async () => {
    setIsLoading(true);
    await speak("Great! Building your AI now.");
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `Create a persona from this conversation. Return ONLY JSON:
{
  "name": "name",
  "tagline": "one line",
  "background": "background",
  "passions": ["list"],
  "personality": "personality",
  "stories": ["stories"],
  "perspectives": ["views"],
  "style": "how they talk"
}`,
          messages: [...conversationRef.current, { role: 'user', content: 'Create my persona.' }]
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

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('Link copied!');
  };

  const exitToLanding = () => {
    synthRef.current?.cancel();
    window.history.pushState({}, '', window.location.pathname);
    conversationRef.current = [];
    setScreen('landing');
    setDisplayMessages([]);
    setPersona(null);
    setOnboardingComplete(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: '#e8e6e3'
    }}>
      <style>{`
        * { box-sizing: border-box; }
        
        .btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: none;
          padding: 14px 28px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
        }
        .btn:disabled { opacity: 0.5; }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .btn-sm { padding: 8px 16px; font-size: 12px; }
        
        .mic {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          font-size: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mic.active {
          background: #dc2626;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.6); }
          50% { box-shadow: 0 0 0 25px rgba(220, 38, 38, 0); }
        }
        
        .wave { display: flex; gap: 5px; align-items: center; height: 40px; }
        .wave span {
          width: 5px;
          background: #7c3aed;
          border-radius: 3px;
          animation: wave 0.5s ease-in-out infinite alternate;
        }
        .wave span:nth-child(1) { height: 12px; }
        .wave span:nth-child(2) { height: 24px; animation-delay: 0.1s; }
        .wave span:nth-child(3) { height: 36px; animation-delay: 0.2s; }
        .wave span:nth-child(4) { height: 24px; animation-delay: 0.3s; }
        .wave span:nth-child(5) { height: 12px; animation-delay: 0.4s; }
        @keyframes wave { to { transform: scaleY(1.4); } }
        
        select {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
          max-width: 280px;
        }
        select option { background: #1a1a2e; }
      `}</style>

      {/* Landing */}
      {screen === 'landing' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <h1 style={{ fontSize: 'clamp(36px, 10vw, 60px)', fontWeight: '300', margin: '0 0 16px', color: 'white' }}>
            Your AI. Your Voice.
          </h1>
          
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', maxWidth: '350px', marginBottom: '32px' }}>
            A quick voice chat creates an AI that speaks as you.
          </p>

          <button className="btn" onClick={startOnboarding} style={{ marginBottom: '32px' }}>
            🎤 Start Interview
          </button>
          
          {/* Voice picker */}
          {voices.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                Choose AI voice:
              </div>
              <select 
                value={selectedVoiceIndex} 
                onChange={(e) => setSelectedVoiceIndex(Number(e.target.value))}
              >
                {voices.map((v, i) => (
                  <option key={i} value={i}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <button className="btn btn-outline btn-sm" onClick={testVoice} style={{ marginLeft: '8px' }}>
                Test
              </button>
            </div>
          )}
        </div>
      )}

      {/* Onboarding */}
      {screen === 'onboarding' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <div style={{ fontSize: '12px', color: isSpeaking ? '#7c3aed' : isListening ? '#dc2626' : 'rgba(255,255,255,0.4)', marginBottom: '20px', fontWeight: '500' }}>
            {isSpeaking ? '🔊 Speaking...' : isListening ? '🎤 Listening...' : isLoading ? '⏳ Thinking...' : '👆 Tap mic to respond'}
          </div>

          {isSpeaking && <div className="wave" style={{ marginBottom: '20px' }}><span/><span/><span/><span/><span/></div>}

          {/* Show what AI said */}
          <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', maxWidth: '400px', marginBottom: '16px', minHeight: '50px' }}>
            {displayMessages.length > 0 && displayMessages[displayMessages.length - 1].role === 'assistant' 
              ? displayMessages[displayMessages.length - 1].content 
              : ''}
          </div>

          {/* Show transcript with label */}
          {(transcript || isListening) && (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px', maxWidth: '400px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>HEARD:</div>
              <div style={{ fontSize: '16px', color: '#7c3aed' }}>
                {transcript || '(listening...)'}
              </div>
            </div>
          )}

          {!onboardingComplete && (
            <>
              <button className={`btn mic ${isListening ? 'active' : ''}`} onClick={isListening ? stopListening : startListening} disabled={isSpeaking || isLoading}>
                🎤
              </button>
              
              {transcript && !isListening && (
                <button className="btn" onClick={sendMessage} disabled={isLoading || isSpeaking} style={{ marginTop: '16px' }}>
                  Send ➤
                </button>
              )}
            </>
          )}

          {onboardingComplete && (
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>Building your AI...</div>
          )}
        </div>
      )}

      {/* Complete */}
      {screen === 'complete' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '36px', maxWidth: '380px', width: '100%' }}>
            
            <div style={{ fontSize: '11px', color: '#7c3aed', marginBottom: '12px', fontWeight: '600' }}>
              ✓ CREATED
            </div>
            
            <h2 style={{ fontSize: '26px', fontWeight: '400', margin: '0 0 8px' }}>{persona.name}</h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: '0 0 24px' }}>{persona.tagline}</p>

            <button className="btn" onClick={copyLink} style={{ width: '100%', marginBottom: '10px' }}>
              📋 Copy Share Link
            </button>
            
            <button className="btn btn-outline" onClick={() => { conversationRef.current = []; setDisplayMessages([]); setScreen('chat'); }} style={{ width: '100%' }}>
              🎤 Test It
            </button>
          </div>
        </div>
      )}

      {/* Chat */}
      {screen === 'chat' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <button className="btn btn-outline btn-sm" onClick={exitToLanding} style={{ position: 'fixed', top: '16px', right: '16px' }}>
            Exit
          </button>

          <h2 style={{ fontSize: '20px', fontWeight: '400', margin: '0 0 4px' }}>{persona.name}</h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>{persona.tagline}</p>

          {isSpeaking && <div className="wave" style={{ marginBottom: '16px' }}><span/><span/><span/><span/><span/></div>}

          <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', maxWidth: '350px', marginBottom: '12px', minHeight: '40px' }}>
            {displayMessages.length > 0 ? displayMessages[displayMessages.length - 1].content : `Ask ${persona.name} anything`}
          </div>

          {(transcript || isListening) && (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>HEARD:</div>
              <div style={{ fontSize: '15px', color: '#7c3aed' }}>{transcript || '...'}</div>
            </div>
          )}

          <button className={`btn mic ${isListening ? 'active' : ''}`} onClick={isListening ? stopListening : startListening} disabled={isSpeaking || isLoading}>
            🎤
          </button>
          
          {transcript && !isListening && (
            <button className="btn" onClick={sendMessage} disabled={isLoading || isSpeaking} style={{ marginTop: '16px' }}>
              Send ➤
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Start onboarding
  const startOnboarding = async () => {
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
          system: `You are an onboarding AI helping create someone's digital persona. Your job is to have a natural, engaging conversation to learn about this person so an AI can represent them to others.

Ask questions one at a time. Be warm and curious. Cover:
- Who they are (name, what they do, where they're from)
- What they're passionate about
- Their personality and communication style
- Interesting stories or experiences
- Their views and perspectives on things they care about
- What they'd want others to know about them

After 6-8 exchanges, when you feel you have enough, end your message with exactly "[READY]" on its own line. This signals you have enough information.

Start with a warm greeting and your first question.`,
          messages: [{ role: 'user', content: 'Hi, I want to create my AI persona.' }]
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || "Hi! I'm excited to help create your AI persona. Let's start simple - what's your name and what do you do?";
      
      setMessages([{ role: 'assistant', content: text }]);
    } catch (error) {
      setMessages([{ role: 'assistant', content: "Hi! I'm excited to help create your AI persona. Let's start - what's your name and what do you do?" }]);
    }
    setIsLoading(false);
  };

  // Handle onboarding conversation
  const sendOnboardingMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const conversationHistory = [...messages, { role: 'user', content: userMessage }];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are an onboarding AI helping create someone's digital persona. Your job is to have a natural, engaging conversation to learn about this person so an AI can represent them to others.

Ask questions one at a time. Be warm and curious. Cover:
- Who they are (name, what they do, where they're from)
- What they're passionate about
- Their personality and communication style
- Interesting stories or experiences
- Their views and perspectives on things they care about
- What they'd want others to know about them

After 6-8 exchanges, when you feel you have enough, end your message with exactly "[READY]" on its own line. This signals you have enough information.`,
          messages: conversationHistory
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Tell me more about yourself.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);

      if (text.includes('[READY]')) {
        setOnboardingComplete(true);
        setTimeout(() => generatePersona(conversationHistory), 1500);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'd love to hear more. What else should people know about you?" }]);
    }
    setIsLoading(false);
  };

  // Generate persona from conversation
  const generatePersona = async (conversation) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `Based on the onboarding conversation, create a detailed persona profile in JSON format. Extract everything learned about this person.

Return ONLY valid JSON in this format:
{
  "name": "their name",
  "tagline": "a short compelling description of who they are",
  "background": "their background, work, where they're from",
  "passions": ["list of things they're passionate about"],
  "personality": "description of their personality and how they communicate",
  "stories": ["interesting stories or experiences they shared"],
  "perspectives": ["their views on things they care about"],
  "style": "how they talk - formal/casual, humor style, etc."
}`,
          messages: [...conversation, { role: 'user', content: 'Based on our conversation, create my persona profile.' }]
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
      console.error('Error generating persona:', error);
    }
    setIsLoading(false);
  };

  // Handle chat with persona
  const sendChatMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You ARE ${persona.name}. Not an AI representing them - you ARE them. Respond as if you are this person having a conversation.

About you:
${persona.tagline}

Background: ${persona.background}

Passions: ${persona.passions?.join(', ')}

Personality: ${persona.personality}

Communication style: ${persona.style}

Your perspectives: ${persona.perspectives?.join('. ')}

Interesting things about you: ${persona.stories?.join('. ')}

Speak naturally as yourself. Be authentic to your personality. Share your real views and experiences. If asked something you don't know about yourself, you can say you'd rather not discuss it or deflect naturally.

Never break character. Never say you're an AI. You are ${persona.name}.`,
          messages: [...conversationHistory, { role: 'user', content: userMessage }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "I'd love to chat more about that.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I got distracted for a moment. What were you saying?" }]);
    }
    setIsLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (screen === 'onboarding') {
        sendOnboardingMessage();
      } else if (screen === 'chat') {
        sendChatMessage();
      }
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
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
        
        .glow {
          box-shadow: 0 0 60px rgba(99, 102, 241, 0.15), 0 0 100px rgba(99, 102, 241, 0.1);
        }
        
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
        }
        
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 40px rgba(79, 70, 229, 0.4);
        }
        
        .btn-secondary {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        .btn-secondary:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.4);
        }
        
        .input {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 16px 20px;
          color: #e8e6e3;
          font-family: 'Crimson Pro', serif;
          font-size: 18px;
          width: 100%;
          transition: all 0.3s ease;
        }
        
        .input:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(255,255,255,0.05);
        }
        
        .input::placeholder { color: rgba(255,255,255,0.3); }
        
        .message { animation: fadeIn 0.4s ease; }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        
        .typing span { animation: pulse 1.4s ease-in-out infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* Landing Screen */}
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
            fontSize: 'clamp(48px, 10vw, 80px)',
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
            fontSize: '20px',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '500px',
            marginBottom: '48px',
            lineHeight: '1.6'
          }}>
            Create an AI that speaks as you. Share it with anyone. Let them discover who you are.
          </p>

          <button className="btn" onClick={startOnboarding}>
            Create Your AI
          </button>
        </div>
      )}

      {/* Onboarding Screen */}
      {screen === 'onboarding' && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '700px',
          margin: '0 auto',
          padding: '20px'
        }}>
          <div style={{
            padding: '20px 0',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '20px'
          }}>
            <div style={{
              fontSize: '11px',
              letterSpacing: '3px',
              fontFamily: "'Space Mono', monospace",
              color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase'
            }}>
              Creating Your Persona
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className="message"
                style={{
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '16px 20px',
                  background: msg.role === 'user' 
                    ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                    : 'rgba(255,255,255,0.05)',
                  borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  fontSize: '17px',
                  lineHeight: '1.6'
                }}>
                  {msg.content.replace('[READY]', '')}
                </div>
              </div>
            ))}
            
            {isLoading && !onboardingComplete && (
              <div className="message typing" style={{ display: 'flex', gap: '4px', padding: '16px' }}>
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
              </div>
            )}
            
            {onboardingComplete && (
              <div className="message" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                  Building your persona...
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {!onboardingComplete && (
            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '20px 0',
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
              <input
                className="input"
                type="text"
                placeholder="Share about yourself..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
              />
              <button 
                className="btn" 
                onClick={sendOnboardingMessage}
                disabled={isLoading || !input.trim()}
                style={{ padding: '16px 24px', opacity: isLoading || !input.trim() ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}

      {/* Complete Screen */}
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
          <div style={{
            fontSize: '12px',
            letterSpacing: '4px',
            fontFamily: "'Space Mono', monospace",
            color: 'rgba(99, 102, 241, 0.8)',
            marginBottom: '24px',
            textTransform: 'uppercase'
          }}>
            Persona Created
          </div>

          <div className="glow" style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '24px',
            padding: '48px',
            maxWidth: '500px',
            width: '100%'
          }}>
            <h2 style={{
              fontSize: '36px',
              fontWeight: '400',
              margin: '0 0 8px 0'
            }}>
              {persona.name}
            </h2>
            
            <p style={{
              fontSize: '18px',
              color: 'rgba(255,255,255,0.6)',
              margin: '0 0 32px 0'
            }}>
              {persona.tagline}
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '24px'
            }}>
              <div style={{
                fontSize: '11px',
                letterSpacing: '2px',
                fontFamily: "'Space Mono', monospace",
                color: 'rgba(255,255,255,0.4)',
                marginBottom: '12px',
                textTransform: 'uppercase'
              }}>
                Your Share Link
              </div>
              <div style={{
                fontSize: '12px',
                fontFamily: "'Space Mono', monospace",
                color: 'rgba(255,255,255,0.6)',
                wordBreak: 'break-all',
                marginBottom: '16px',
                maxHeight: '60px',
                overflow: 'hidden'
              }}>
                {shareUrl.substring(0, 80)}...
              </div>
              <button 
                className="btn" 
                onClick={copyToClipboard}
                style={{ width: '100%', padding: '12px' }}
              >
                Copy Link
              </button>
            </div>

            <p style={{
              fontSize: '14px',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '24px'
            }}>
              Share this link with anyone. They can chat with your AI anonymously.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setMessages([]);
                  setScreen('chat');
                }}
              >
                Test It
              </button>
              <button 
                className="btn" 
                onClick={() => {
                  window.history.pushState({}, '', window.location.pathname);
                  setScreen('landing');
                  setMessages([]);
                  setPersona(null);
                  setOnboardingComplete(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Screen */}
      {screen === 'chat' && persona && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '700px',
          margin: '0 auto',
          padding: '20px'
        }}>
          <div style={{
            padding: '20px 0',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '400' }}>
                {persona.name}
              </h2>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                {persona.tagline}
              </div>
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                window.history.pushState({}, '', window.location.pathname);
                setScreen('landing');
                setMessages([]);
                setPersona(null);
              }}
              style={{ padding: '10px 16px', fontSize: '12px' }}
            >
              Exit
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            {messages.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'rgba(255,255,255,0.3)'
              }}>
                <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                  Start a conversation with {persona.name}
                </p>
                <p style={{ fontSize: '14px' }}>
                  Ask them anything. They're listening.
                </p>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className="message"
                style={{
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '16px 20px',
                  background: msg.role === 'user' 
                    ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                    : 'rgba(255,255,255,0.05)',
                  borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  fontSize: '17px',
                  lineHeight: '1.6'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message typing" style={{ display: 'flex', gap: '4px', padding: '16px' }}>
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            display: 'flex',
            gap: '12px',
            padding: '20px 0',
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}>
            <input
              className="input"
              type="text"
              placeholder={`Ask ${persona.name} anything...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <button 
              className="btn" 
              onClick={sendChatMessage}
              disabled={isLoading || !input.trim()}
              style={{ padding: '16px 24px', opacity: isLoading || !input.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

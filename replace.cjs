const fs = require('fs');

const file = 'server.ts';
let content = fs.readFileSync(file, 'utf8');

const startMarker = '// --- Baileys WhatsApp Provider Implementation ---';
const endMarker = '// --- ADMIN DEMO SEEDING ENDPOINTS ---';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("Markers not found");
  process.exit(1);
}

const newCode = `// --- Baileys WhatsApp Provider Implementation (Multi-Tenant) ---
  
  type WhatsAppSession = {
    sock: any;
    qr: string | null;
    connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'QRCODE' | 'LOADING';
  };
  
  const whatsappSessions: Map<string, WhatsAppSession> = new Map();

  function getSession(tenantId: string): WhatsAppSession {
    if (!whatsappSessions.has(tenantId)) {
      whatsappSessions.set(tenantId, {
        sock: null,
        qr: null,
        connectionStatus: 'DISCONNECTED'
      });
    }
    return whatsappSessions.get(tenantId);
  }

  async function connectToWhatsApp(tenantId: string) {
    try {
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
      const { default: pino } = await import('pino');
      const fs = await import('fs');
      const path = await import('path');
      const QRCode = await import('qrcode');

      const session = getSession(tenantId);

      if (session.connectionStatus === 'CONNECTED' || (session.connectionStatus === 'LOADING' && session.sock)) return;
      
      session.connectionStatus = 'LOADING';

      const { version } = await fetchLatestBaileysVersion();
      
      const authPath = path.resolve(process.cwd(), 'auth_info', tenantId);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      session.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        browser: ['AxéCloud', 'Chrome', '1.0.0']
      });

      session.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr: newQr } = update;

        if (newQr) {
          session.qr = await QRCode.toDataURL(newQr);
          session.connectionStatus = 'QRCODE';
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMsg = lastDisconnect?.error?.message || '';
          
          const isConnectionFailure = statusCode === 401 && errorMsg.includes('Connection Failure');
          const isLoggedOut = (statusCode === DisconnectReason.loggedOut || statusCode === 401) && !isConnectionFailure;
          const isConflict = statusCode === DisconnectReason.conflict || statusCode === 440;
          
          const shouldReconnect = !isLoggedOut && !isConflict;
          
          console.log(\`[WP - \${tenantId}] Conexão fechada. Código: \${statusCode}. Motivo:\`, errorMsg || 'Desconhecido', '. Reconectando:', shouldReconnect);
          
          session.connectionStatus = 'DISCONNECTED';
          session.qr = null;
          
          if (shouldReconnect) {
            setTimeout(() => connectToWhatsApp(tenantId), 5000);
          } else {
            console.log(\`[WP - \${tenantId}] Reconexão cancelada devido a Logout ou Conflito (Stream Errored). Limpando credenciais...\`);
            session.sock = null;
            if (isLoggedOut || isConflict) {
              if (fs.existsSync(authPath)) {
                 fs.rmSync(authPath, { recursive: true, force: true });
                 console.log(\`[WP - \${tenantId}] Pasta auth_info removida com sucesso. Requisite um novo QR Code.\`);
              }
            }
          }
        } else if (connection === 'open') {
          console.log(\`[WP - \${tenantId}] WhatsApp Conectado com Baileys!\`);
          session.connectionStatus = 'CONNECTED';
          session.qr = null;
        }
      });

      session.sock.ev.on('messages.upsert', async (m: any) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage || !senderJid) return;

        const cleanText = textMessage.trim().toUpperCase();
        
        const isConfirmation = cleanText.startsWith('SIM') || cleanText.startsWith('NAO') || cleanText.startsWith('NÃO');

        if (isConfirmation) {
           const match = cleanText.match(/^(SIM|NAO|NÃO)(?:\\s+(\\d{8,11}))?\\s*$/i);
           
           if (!match) return;

           const action = match[1].toUpperCase();
           const extractedPhoneFromText = match[2];
           
           const isLid = senderJid.includes('@lid');
           const defaultSenderPhone = senderJid.replace(/[^0-9]/g, ''); 
           
           const newStatus = action === 'SIM' ? 'Confirmado' : 'Recusado';
           
           try {
             let searchPhone = extractedPhoneFromText || defaultSenderPhone;
             const last8 = searchPhone.slice(-8);
             
             console.log(\`[WP BOT - \${tenantId}] Recebeu '\${action}' de jid: \${senderJid} (isLid=\${isLid}). Buscando final: \${last8}\`);

             const { data: convites, error: queryError } = await supabaseAdmin
               .from('convidados_eventos')
               .select('*')
               .eq('tenant_id', tenantId)
               .ilike('telefone', \`%\${last8}\`);
              
              if (queryError) {
                  console.error(\`[WP BOT - \${tenantId}] Erro de DB ao consultar convite:\`, queryError.message);
                  return;
              }

              if (convites && convites.length > 0) {
                 const convitesPendentes = convites.filter((c: any) => c.status !== newStatus);
                 
                 for (const convite of convitesPendentes) {
                    await supabaseAdmin
                      .from('convidados_eventos')
                      .update({ status: newStatus })
                      .eq('id', convite.id);
                 }
                 
                 if (convitesPendentes.length > 0) {
                    const confirmMsg = action === 'SIM' 
                      ? "Axé! Sua presença foi confirmada com sucesso. Aguardamos você!"
                      : "Agradecemos o aviso! Sua ausência foi registrada. Pai/Mãe Oxalá abençoe!";
                    await enviarMensagem(tenantId, senderJid, confirmMsg);
                    console.log(\`[WP BOT - \${tenantId}] Presença atualizada como \${newStatus} para os eventos atrelados!\`);
                 } else {
                     await enviarMensagem(tenantId, senderJid, \`Seu status já constava como \${newStatus} em nosso sistema! Axé.\`);
                 }
              } else {
                 console.log(\`[WP BOT - \${tenantId}] Nenhum convite atrelado a este número (final \${last8}).\`);
                 if (isLid && !extractedPhoneFromText) {
                    const fallbackMsg = "Axé! Recebemos sua mensagem, mas por questões de privacidade do WhatsApp Comercial, não conseguimos identificar seu número de telefone original automaticamente.\\n\\nPara confirmarmos sua presença no sistema, por favor reenvie sua resposta incluindo seu número com DDD.\\n\\n*Exemplo: SIM 11999999999*";
                    await enviarMensagem(tenantId, senderJid, fallbackMsg);
                 } else {
                    const errorMsg = "Não localizamos nenhum convite pendente para este número de telefone no sistema do Terreiro. Houve alguma alteração de número?";
                    await enviarMensagem(tenantId, senderJid, errorMsg);
                 }
              }
           } catch(e: any) {
             console.error(\`[WP BOT - \${tenantId}] Internal Error:\`, e);
           }
        }
      });

      session.sock.ev.on('creds.update', saveCreds);

    } catch (err) {
      console.error(\`[WP - \${tenantId}] Erro fatal na inicialização do Baileys:\`, err);
      const session = getSession(tenantId);
      session.connectionStatus = 'DISCONNECTED';
    }
  }

  const enviarMensagem = async (tenantId: string, numero: string, texto: string) => {
    const session = getSession(tenantId);
    if (!session.sock || session.connectionStatus !== 'CONNECTED') {
      console.error(\`[WP - \${tenantId}] Erro: Tentativa de envio sem conexão ativa.\`);
      return false;
    }
    try {
      let jid = numero;
      
      if (!numero.includes('@')) {
        let cleanNumber = numero.replace(/\\D/g, '');
        if (!cleanNumber.startsWith('55')) {
          cleanNumber = \`55\${cleanNumber}\`;
        }
        jid = \`\${cleanNumber}@s.whatsapp.net\`;
      }
      
      console.log(\`[WP - \${tenantId}] Tentando enviar mensagem para o JID EXATO: \${jid}\`);
      await session.sock.sendMessage(jid, { text: texto });
      console.log(\`[WP - \${tenantId}] Mensagem enviada com sucesso para o JID: \${jid}\`);
      
      return true;
    } catch (err: any) {
      console.error(\`[WP - \${tenantId}] Falha ao enviar mensagem para o JID \${numero}:\`, err.message);
      return false;
    }
  };

  // --- WHATSAPP INTEGRATION ENDPOINTS ---

  app.post("/api/whatsapp/config", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const config = req.body;
      const { error } = await supabaseAdmin
        .from('whatsapp_config')
        .upsert({
          ...config,
          id: user.id,
          tenant_id: user.id,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { tipo, filhoId, variables, forcePhone } = req.body;

      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('*')
        .eq('tenant_id', user.id)
        .single();

      const session = getSession(user.id);
      if (session.connectionStatus !== 'CONNECTED') {
         return res.status(400).json({ error: "WhatsApp não configurado ou desconectado no Servidor" });
      }

      let phone = forcePhone;
      if (!phone && filhoId) {
        const { data: filho } = await supabaseAdmin
          .from('filhos_de_santo')
          .select('whatsapp_phone')
          .eq('id', filhoId)
          .single();
        phone = filho?.whatsapp_phone;
      }

      if (!phone) return res.status(400).json({ error: "Telefone não encontrado" });

      phone = phone.replace(/\\D/g, '');
      if (!phone.startsWith('55')) phone = '55' + phone;

      let message = config?.templates?.[tipo] || "Mensagem do AxéCloud";
      
      if (tipo === 'cobranca_mensalidade' && !config?.templates?.[tipo]) {
        message = "Olá, {{nome_filho}}! Passando para lembrar da sua mensalidade de {{mes_ano}} no valor de R$ {{valor}} no {{nome_terreiro}}. Sua contribuição é fundamental para o nosso fundamento. Axé!";
      }
      if (tipo === 'financeiro' && !config?.templates?.[tipo]) {
        message = "Olá, {{nome_filho}}! Lembramos do pagamento de sua mensalidade no valor de R$ {{valor_mensalidade}}, com vencimento em {{data_vencimento}}, para o terreiro {{nome_terreiro}}. Axé!";
      }
      if (tipo === 'mural_aviso' && !config?.templates?.[tipo]) {
        message = "Paz e Luz, {{nome_filho}}! Há um novo aviso no Mural do terreiro {{nome_terreiro}}:\\n\\n*{{titulo_aviso}}*\\n\\nAcesse o sistema para ver os detalhes. Axé!";
      }
      if (tipo === 'estoque_critico' && !config?.templates?.[tipo]) {
        message = "⚠️ *ALERTA DE ESTOQUE* ⚠️\\nOlá! O item *{{item_nome}}* atingiu o nível crítico no {{nome_terreiro}}.\\nQuantidade atual: {{quantidade}}\\nPor favor, providencie a reposição conforme necessário.";
      }
      if (tipo === 'convite_evento' && !config?.templates?.[tipo]) {
        message = "Paz e Luz, {{nome_convidado}}!\\nO terreiro {{nome_terreiro}} tem a honra de te convidar para o nosso próximo encontro:\\n\\n*{{nome_evento}}*\\n📅 Data: {{data_evento}}\\n⏰ Horário: {{hora_evento}}\\n\\n⏳ *Por favor, responda com SIM para confirmar sua presença, ou NÃO caso não possa comparecer.*\\n\\nAguardamos sua presença! Axé!";
      }
      if (tipo === 'boas_vindas' && !config?.templates?.[tipo]) {
        message = "Seja muito bem-vindo(a), porta de entrada do Axé, {{nome_filho}}! 🙏\\n\\nÉ uma alegria imensa ter você fazendo parte da família {{nome_terreiro}}. Que sua caminhada seja de muita luz, aprendizado e evolução sob a proteção dos nossos Orixás e Guias.\\n\\nEste é o nosso canal oficial de comunicação. Por aqui você receberá avisos, calendários e informações importantes do terreiro.\\n\\nAxé! ✨";
      }

      Object.entries(variables || {}).forEach(([key, value]) => {
        message = message.replace(new RegExp(\`{{\${key}}}\`, 'g'), String(value));
      });

      if (message.includes('nota sigilosa') || message.includes('segredo')) {
        message = "Você tem uma nova atualização sigilosa no seu prontuário. Acesse o AxéCloud para conferir.";
      }

      setTimeout(async () => {
        try {
          console.log(\`[WHATSAPP - \${user.id}] Dispatching message to \${phone}\`);
          let externalId = \`msg_\${Math.random().toString(36).substr(2, 9)}\`;

          if (session.connectionStatus === 'CONNECTED') {
             try {
                const success = await enviarMensagem(user.id, phone, message);
                if (success) console.log(\`[WP - \${user.id}] Mensagem disparada com sucesso.\`);
             } catch(e: any) {
                console.error(\`[WP - \${user.id}] Falha ao enviar:\`, e.message);
             }
          }

          await supabaseAdmin.from('whatsapp_logs').insert({
            tenant_id: user.id,
            filho_id: filhoId,
            tipo,
            telefone: phone,
            mensagem: message,
            status: 'sent',
            external_id: externalId
          });

        } catch (err: any) {
          console.error(\`[WHATSAPP - \${user.id}] Dispatch Error:\`, err.message);
        }
      }, 500);

      res.json({ success: true, message: "Mensagem enfileirada para envio" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    const { instance, data } = req.body;
    const externalId = data?.key?.id;
    const status = data?.status;

    if (externalId) {
      let mappedStatus = 'sent';
      if (status === 'DELIVERY_ACK') mappedStatus = 'delivered';
      if (status === 'READ') mappedStatus = 'read';

      await supabaseAdmin
        .from('whatsapp_logs')
        .update({ status: mappedStatus })
        .eq('external_id', externalId);
    }

    res.status(200).send('OK');
  });

  app.post("/api/whatsapp/start", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      if (session.connectionStatus === 'CONNECTED') {
        return res.json({ message: "WhatsApp já está conectado." });
      }
      
      session.sock = null; 
      connectToWhatsApp(user.id);
      res.json({ message: "Iniciando Baileys..." });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/test-message", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Telefone é obrigatório." });

      const msg = "Axé! Este é um teste de conexão do AxéCloud. Se você recebeu isso, seu terreiro já está automatizado!";
      const success = await enviarMensagem(user.id, phone, msg);

      if (success) {
        return res.json({ success: true, message: "Mensagem enviada com sucesso!" });
      } else {
        return res.status(500).json({ error: "Falha ao enviar." });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      res.json({
          status: session.connectionStatus,
          qrcode: session.qr
      });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      if (session.sock) {
          try {
              await session.sock.logout();
              session.sock = null;
              session.connectionStatus = 'DISCONNECTED';
              session.qr = null;
              
              const fs = await import('fs');
              const path = await import('path');
              const authPath = path.resolve(process.cwd(), 'auth_info', user.id);
              if (fs.existsSync(authPath)) {
                 fs.rmSync(authPath, { recursive: true, force: true });
                 console.log(\`[WP - \${user.id}] Pasta auth_info removida após logout.\`);
              }
          } catch(e) {
              console.error(\`[WP - \${user.id}] Falha ao deslogar:\`, e);
          }
      }
      
      res.json({ message: "Sessão Baileys encerrada" });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  setTimeout(async () => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const authRoot = path.resolve(process.cwd(), 'auth_info');
      
      if (fs.existsSync(authRoot)) {
        const directories = fs.readdirSync(authRoot, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const tenantId of directories) {
          const credsPath = path.join(authRoot, tenantId, 'creds.json');
          if (fs.existsSync(credsPath)) {
            console.log(\`[WP - \${tenantId}] Sessão anterior detectada. Restaurando...\`);
            connectToWhatsApp(tenantId);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
    } catch (e: any) {
      console.error("[WP] Erro no auto-init:", e.message);
    }
  }, 5000);

`;

content = content.substring(0, startIdx) + newCode + content.substring(endIdx);
fs.writeFileSync(file, content);
console.log("Replaced successfully");

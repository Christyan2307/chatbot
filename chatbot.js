const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const mysql = require("mysql2/promise");

// === DB ===

const db = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQL_DATABASE || "sistema_clientes",
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306
});

module.exports = db;

// util
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

let checkTimer = null;   // controla o setInterval
let isReady = false;     // estado do socket (pronto p/ enviar)

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth");

  const sock = makeWASocket({
    auth: state,
    // evita baixar histórico completo (reduz chance de "Bad MAC"/"Invalid patch mac" em sessões novas)
    syncFullHistory: false,
    // você pode deixar true se quiser aparecer online ao conectar
    markOnlineOnConnect: true,
  });

  // eventos principais
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log("📲 Escaneie o QR Code acima com seu WhatsApp!");
    }

    if (connection === "open") {
      console.log("✅ Bot conectado no WhatsApp!");
      isReady = true;

      // evita múltiplos timers em reconexões
      if (checkTimer) clearInterval(checkTimer);
      checkTimer = setInterval(() => enviarMensagensAutomaticas(sock), 3000);
    }

    if (connection === "close") {
      isReady = false;
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Conexão fechada. Reconectar?", shouldReconnect, "| code:", statusCode);

      // se deslogou do WhatsApp no celular, apague a pasta baileys_auth e pare aqui
      if (shouldReconnect) startBot();
    }
  });

  // === funções internas ===
  async function getClientesPendentes() {
    const [rows] = await db.query(
      "SELECT id, nome, telefone, status FROM clientes WHERE precisa_notificacao = 1"
    );
    return rows;
  }

  async function enviarMensagensAutomaticas(sockRef) {
    try {
      if (!isReady || !sockRef) {
        console.log("⚠️ Socket não está pronto ainda...");
        return;
      }

      const clientes = await getClientesPendentes();
      if (!Array.isArray(clientes) || clientes.length === 0) return;

      console.log(`🔎 Clientes pendentes: ${clientes.length}`);

      for (const cliente of clientes) {
        let mensagem = "";
        switch (cliente.status) {
          case "andamento":
            mensagem = `Olá ${cliente.nome}, seu agendamento está em andamento. ⏳`;
            break;
          case "aprovado":
            mensagem = `Olá ${cliente.nome}, parabéns! Seu cadastro foi aprovado. 🎉`;
            break;
          case "cancelado":
            mensagem = `Olá ${cliente.nome}, seu agendamento foi cancelado. ❌`;
            break;
          default:
            // se quiser ignorar status desconhecido
            continue;
        }

        let numero = String(cliente.telefone || "").replace(/\D/g, "");
        if (!numero) {
          console.log(`⚠️ Telefone inválido (cliente id=${cliente.id}).`);
          continue;
        }
        if (!numero.startsWith("55")) {
          numero = "55" + numero;
        }
        const jid = `${numero}@s.whatsapp.net`;

        try {
          await sockRef.sendMessage(jid, { text: mensagem });
          console.log(`📩 Enviado para ${cliente.nome} (${jid})`);

          await db.query("UPDATE clientes SET precisa_notificacao = 0 WHERE id = ?", [cliente.id]);

          await delay(1500); // pequeno atraso para não flodar
        } catch (err) {
          console.error(`❌ Erro ao enviar para ${cliente.nome} (${jid}):`, err?.message || err);
        }
      }
    } catch (error) {
      console.error("Erro ao enviar mensagens automáticas:", error);
    }
  }
}

startBot();

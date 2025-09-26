const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const mysql = require("mysql2/promise");

// === DB ===
const db = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.MYSQL_HOST || "127.0.0.1",
  user: process.env.MYSQLUSER || process.env.MYSQL_USER || "root",
  password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || "sistema_clientes",
  port: process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT) : 3306
});

console.log("🔌 Tentando conectar no MySQL:", {
  host: process.env.MYSQLHOST || process.env.MYSQL_HOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER || process.env.MYSQL_USER,
  database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE
});

// Teste de conexão ao iniciar
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("✅ Conectado ao MySQL!");
    connection.release();
  } catch (err) {
    console.error("❌ Erro ao conectar ao MySQL:", err);
  }
})();

// util
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

let checkTimer = null;   // controla o setInterval
let isReady = false;     // estado do socket (pronto p/ enviar)

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth");

  const sock = makeWASocket({
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  // eventos principais
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;


    if (qr) {
  // Gera uma URL do QR Code para abrir no navegador
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  console.log("📲 Escaneie o QR Code neste link:");
  console.log(qrImageUrl);
}


    if (connection === "open") {
      console.log("✅ Bot conectado no WhatsApp!");
      isReady = true;

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

          await delay(1500);
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

module.exports = db; // exporta a pool para outros arquivos se necessário

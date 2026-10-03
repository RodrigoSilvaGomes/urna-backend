const express = require("express");
const cors = require("cors");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================
// CONFIGURAÇÃO DO FIREBASE ADMIN
// ======================================

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Ambiente de Produção (Render)
    const rawAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    serviceAccount =
      typeof rawAccount === "string" ? JSON.parse(rawAccount) : rawAccount;

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(
        /\\n/g,
        "\n",
      );
    }
  } else {
    // Ambiente Local (VS Code)
    serviceAccount = require("./serviceAccountKey.json");
  }
} catch (error) {
  console.error("Erro crítico nas credenciais do Firebase:", error.message);
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const COLECAO = "eleicoes";
const DOCUMENTO = "paraiba2026";
const referencia = db.collection(COLECAO).doc(DOCUMENTO);

// ======================================
// MIDDLEWARES
// ======================================

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ======================================
// ESTRUTURA INICIAL DOS RESULTADOS
// ======================================

function criarVotosIniciais() {
  return {
    totalEleitores: 0,
    votos: {
      deputadoFederal: {
        brancos: 0,
        nulos: 0,
        candidatos: { 6849: 0, 7358: 0, 8173: 0, 9264: 0 },
      },
      deputadoEstadual: {
        brancos: 0,
        nulos: 0,
        candidatos: { 58127: 0, 69438: 0, 82751: 0, 93642: 0 },
      },
      senador1: {
        brancos: 0,
        nulos: 0,
        candidatos: { 581: 0, 694: 0, 827: 0, 936: 0 },
      },
      senador2: {
        brancos: 0,
        nulos: 0,
        candidatos: { 581: 0, 694: 0, 827: 0, 936: 0 },
      },
      governador: {
        brancos: 0,
        nulos: 0,
        candidatos: { 51: 0, 82: 0, 88: 0, 93: 0 },
      },
      presidente: {
        brancos: 0,
        nulos: 0,
        candidatos: { 58: 0, 67: 0 },
      },
    },
  };
}

// ======================================
// INICIALIZA DOCUMENTO SE NÃO EXISTIR
// ======================================

async function inicializarBanco() {
  const documento = await referencia.get();

  if (!documento.exists) {
    await referencia.set(criarVotosIniciais());
    console.log("Documento 'paraiba2026' criado com sucesso no Firestore.");
  } else {
    console.log("Banco de dados do Firestore conectado e pronto.");
  }
}

// ======================================
// ROTA 1 — REGISTRAR VOTAÇÃO
// ======================================

app.post("/api/votar", async (req, res) => {
  try {
    const { votosEleitor } = req.body;

    if (!Array.isArray(votosEleitor)) {
      return res
        .status(400)
        .json({ error: "Dados da votação devem ser uma lista." });
    }

    const cargosPermitidos = [
      "deputadoFederal",
      "deputadoEstadual",
      "senador1",
      "senador2",
      "governador",
      "presidente",
    ];

    if (
      votosEleitor.length !== cargosPermitidos.length ||
      new Set(votosEleitor.map((v) => v.cargoTipo)).size !==
        cargosPermitidos.length ||
      !votosEleitor.every((v) => cargosPermitidos.includes(v.cargoTipo))
    ) {
      return res.status(400).json({
        error: "Estrutura da votação incompatível ou com cargos duplicados.",
      });
    }

    await db.runTransaction(async (transaction) => {
      const documento = await transaction.get(referencia);

      let dados;
      if (!documento.exists) {
        dados = criarVotosIniciais();
      } else {
        dados = documento.data();
      }

      dados.totalEleitores = (dados.totalEleitores || 0) + 1;

      for (const voto of votosEleitor) {
        const { cargoTipo, tipo, numero } = voto;
        const cargoData = dados.votos[cargoTipo];

        if (!cargoData) {
          throw new Error(`Cargo '${cargoTipo}' não existe no Firestore.`);
        }

        if (tipo === "BRANCO") {
          cargoData.brancos = (cargoData.brancos || 0) + 1;
        } else if (tipo === "NULO") {
          cargoData.nulos = (cargoData.nulos || 0) + 1;
        } else if (tipo === "VÁLIDO") {
          const numString = String(numero);

          if (!cargoData.candidatos) {
            cargoData.candidatos = {};
          }

          // Se o número do candidato ainda não existia no mapa do banco, inicializa com 1
          if (cargoData.candidatos[numString] === undefined) {
            cargoData.candidatos[numString] = 1;
          } else {
            cargoData.candidatos[numString]++;
          }
        } else {
          throw new Error("Tipo de voto inválido.");
        }
      }

      transaction.set(referencia, dados);
    });

    return res.json({
      status: "sucesso",
      message: "Voto computado com sucesso no Firestore!",
    });
  } catch (erro) {
    console.error("Erro ao processar /api/votar:", erro.message);

    return res.status(500).json({
      error: "Falha ao gravar no Firestore.",
      detalhe: erro.message,
    });
  }
});

// ======================================
// ROTA 2 — CONSULTAR APURAÇÃO
// ======================================

app.get("/api/apuracao", async (req, res) => {
  try {
    const documento = await referencia.get();

    if (!documento.exists) {
      return res.status(404).json({ error: "Resultados não encontrados." });
    }

    return res.json(documento.data());
  } catch (erro) {
    console.error("Erro ao consultar /api/apuracao:", erro);
    return res
      .status(500)
      .json({ error: "Não foi possível consultar os resultados." });
  }
});

// ======================================
// INICIALIZAÇÃO
// ======================================

async function iniciarServidor() {
  try {
    await inicializarBanco();
    app.listen(PORT, () => {
      console.log(`Servidor rodando perfeitamente na porta ${PORT}`);
    });
  } catch (erro) {
    console.error("Falha fatal ao iniciar o servidor:", erro);
    process.exit(1);
  }
}

iniciarServidor();

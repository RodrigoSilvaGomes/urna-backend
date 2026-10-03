const express = require("express");
const cors = require("cors");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================
// FIREBASE
// ======================================

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Credencial do Firebase não configurada.");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

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
// CONFIGURAÇÕES
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
        candidatos: {
          6849: 0,
          7358: 0,
          8173: 0,
          9264: 0,
        },
      },

      deputadoEstadual: {
        brancos: 0,
        nulos: 0,
        candidatos: {
          58127: 0,
          69438: 0,
          82751: 0,
          93642: 0,
        },
      },

      senador1: {
        brancos: 0,
        nulos: 0,
        candidatos: {
          581: 0,
          694: 0,
          827: 0,
          936: 0,
        },
      },

      senador2: {
        brancos: 0,
        nulos: 0,
        candidatos: {
          581: 0,
          694: 0,
          827: 0,
          936: 0,
        },
      },

      governador: {
        brancos: 0,
        nulos: 0,
        candidatos: {
          58: 0,
          69: 0,
          82: 0,
          93: 0,
        },
      },

      presidente: {
        brancos: 0,
        nulos: 0,
        candidatos: {
          58: 0,
          69: 0,
        },
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
    await referencia.create(criarVotosIniciais());

    console.log("Documento de votação criado no Firestore.");
  } else {
    console.log("Resultados existentes encontrados.");
  }
}

// ======================================
// ROTA 1 — REGISTRAR VOTAÇÃO
// ======================================

app.post("/api/votar", async (req, res) => {
  try {
    const { votosEleitor } = req.body;

    if (!Array.isArray(votosEleitor)) {
      return res.status(400).json({
        error: "Dados inválidos.",
      });
    }

    const cargosPermitidos = [
      "deputadoFederal",
      "deputadoEstadual",
      "senador1",
      "senador2",
      "governador",
      "presidente",
    ];

    // Verifica se todos os cargos foram enviados
    if (
      votosEleitor.length !== cargosPermitidos.length ||
      new Set(votosEleitor.map((v) => v.cargoTipo)).size !==
        cargosPermitidos.length ||
      !votosEleitor.every((v) => cargosPermitidos.includes(v.cargoTipo))
    ) {
      return res.status(400).json({
        error: "Estrutura da votação inválida.",
      });
    }

    await db.runTransaction(async (transaction) => {
      const documento = await transaction.get(referencia);

      if (!documento.exists) {
        throw new Error("Documento de votação não encontrado.");
      }

      const dados = documento.data();

      dados.totalEleitores++;

      for (const voto of votosEleitor) {
        const { cargoTipo, tipo, numero } = voto;

        const cargoData = dados.votos[cargoTipo];

        if (!cargoData) {
          throw new Error("Cargo inválido.");
        }

        if (tipo === "BRANCO") {
          cargoData.brancos++;
        } else if (tipo === "NULO") {
          cargoData.nulos++;
        } else if (tipo === "VÁLIDO") {
          if (
            typeof numero !== "string" ||
            !Object.prototype.hasOwnProperty.call(cargoData.candidatos, numero)
          ) {
            throw new Error("Número de candidato inválido.");
          }

          cargoData.candidatos[numero]++;
        } else {
          throw new Error("Tipo de voto inválido.");
        }
      }

      transaction.set(referencia, dados);
    });

    return res.json({
      status: "sucesso",
      message: "Votação registrada no Firestore!",
    });
  } catch (erro) {
    console.error("Erro ao registrar votação:", erro);

    return res.status(500).json({
      error: "Não foi possível registrar a votação.",
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
      return res.status(404).json({
        error: "Resultados não encontrados.",
      });
    }

    return res.json(documento.data());
  } catch (erro) {
    console.error("Erro ao consultar apuração:", erro);

    return res.status(500).json({
      error: "Não foi possível consultar os resultados.",
    });
  }
});

// ======================================
// INICIALIZAÇÃO DO SERVIDOR
// ======================================

async function iniciarServidor() {
  try {
    await inicializarBanco();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (erro) {
    console.error("Falha ao iniciar:", erro);
    process.exit(1);
  }
}

iniciarServidor();

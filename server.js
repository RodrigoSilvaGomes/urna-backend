const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const FILE_PATH = path.join(__dirname, 'votos.json');

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do front-end (HTML, CSS, imagens)
app.use(express.static(path.join(__dirname, 'public')));

// Função para ler o arquivo JSON
function lerVotos() {
  const data = fs.readFileSync(FILE_PATH, 'utf8');
  return JSON.parse(data);
}

// Função para salvar no arquivo JSON
function salvarVotos(dados) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(dados, null, 2), 'utf8');
}

// ROTA 1: Registrar Voto
app.post('/api/votar', (req, res) => {
  const { votosEleitor } = req.body; // Array com os votos enviados pelo front-end

  if (!Array.isArray(votosEleitor)) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  const dados = lerVotos();
  dados.totalEleitores++;

  votosEleitor.forEach((voto) => {
    const { cargoTipo, tipo, numero } = voto;
    const cargoData = dados.votos[cargoTipo];

    if (cargoData) {
      if (tipo === 'BRANCO') {
        cargoData.brancos++;
      } else if (tipo === 'NULO') {
        cargoData.nulos++;
      } else if (tipo === 'VÁLIDO' && numero) {
        cargoData.candidatos[numero] = (cargoData.candidatos[numero] || 0) + 1;
      }
    }
  });

  salvarVotos(dados);
  return res.json({ status: 'sucesso', message: 'Voto registrado!' });
});

// ROTA 2: Obter Apuração Global
app.get('/api/apuracao', (req, res) => {
  const dados = lerVotos();
  return res.json(dados);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
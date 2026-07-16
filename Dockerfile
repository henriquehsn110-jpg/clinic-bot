# Arquivo: Dockerfile (Otimizado para Produção)
FROM node:22-alpine 
# Utilizando LTS para menor superfície de ataque e máxima estabilidade

WORKDIR /usr/src/app

# Instalação de dependências otimizada
COPY package*.json ./
RUN npm ci --only=production

# Copia do código validado
COPY . .

# Proteção: Execução sem privilégios de root para segurança do container
USER node

EXPOSE 3000

# Execução nativa recomendada sobre PM2 para containers modernos (evita processos zombies)
CMD ["node", "server.js"]

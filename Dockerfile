# ============================================
# Stage 1: Build the React frontend
# ============================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy frontend source and build
COPY . .
RUN npm run build

# ============================================
# Stage 2: Build the backend + serve everything
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend package files and install
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server/src ./src
COPY server/prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy frontend build output from Stage 1
COPY --from=frontend-build /app/frontend/dist ./client-dist

# Expose backend port
EXPOSE 3000

# Run Prisma migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]

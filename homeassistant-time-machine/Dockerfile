ARG BUILD_FROM
# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy all application files
COPY . .

# Build Next.js application
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Stage 2: Create the final image
FROM $BUILD_FROM

# Install Node.js
RUN apk add --no-cache nodejs

WORKDIR /app

# Copy built application from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/run.sh ./run.sh
COPY --from=builder /app/scheduled-jobs.json ./scheduled-jobs.json


# Expose the port Next.js runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]

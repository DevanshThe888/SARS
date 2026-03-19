FROM node:20-bookworm

# Install C++ compiler explicitly
RUN apt-get update && apt-get install -y g++ build-essential

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package files and install Node modules
COPY package*.json ./
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Compile the C++ assembler and emulator natively for Linux
RUN g++ assembler.cpp -o asm
RUN g++ emulator.cpp -o emu

# Ensure they have execution permissions
RUN chmod +x asm emu

# Expose the port your server listens on
EXPOSE 3001

# Run the backend server
CMD ["node", "server.js"]

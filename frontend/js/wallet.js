// frontend/js/wallet.js - Robust wallet connection state machine

export class WalletManager {
  constructor(onStateChange) {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.onStateChange = onStateChange;
    this.isConnecting = false;

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => this.handleAccountsChanged(accounts));
      window.ethereum.on('chainChanged', (chainId) => this.handleChainChanged(chainId));
    }
  }

  async connect() {
    if (!window.ethereum) {
      throw new Error("No Web3 wallet (MetaMask) detected. Please install a compatible browser wallet.");
    }

    try {
      this.isConnecting = true;
      this.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await this.provider.send("eth_requestAccounts", []);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      this.isConnecting = false;

      this.onStateChange({
        status: "CONNECTED",
        address: this.address,
        chainId: this.chainId,
        signer: this.signer,
        provider: this.provider
      });

      return { address: this.address, chainId: this.chainId };
    } catch (err) {
      this.isConnecting = false;
      this.onStateChange({
        status: "ERROR",
        error: err.message
      });
      throw err;
    }
  }

  async switchNetwork(targetChainIdHex) {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (switchError) {
      console.warn("Could not auto-switch network:", switchError);
    }
  }

  handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      this.address = null;
      this.signer = null;
      this.onStateChange({ status: "DISCONNECTED" });
    } else {
      this.address = accounts[0];
      this.connect();
    }
  }

  handleChainChanged(chainIdHex) {
    this.chainId = parseInt(chainIdHex, 16);
    this.connect();
  }

  disconnect() {
    this.address = null;
    this.signer = null;
    this.onStateChange({ status: "DISCONNECTED" });
  }
}

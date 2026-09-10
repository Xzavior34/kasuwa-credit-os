// frontend/js/wallet.js - Robust wallet connection state machine with automatic CC3 chain addition

export class WalletManager {
  constructor(onStateChange) {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.onStateChange = onStateChange;
    this.isConnecting = false;

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => this.handleAccountsChanged(accounts));
      window.ethereum.on('chainChanged', (chainId) => this.handleChainChanged(chainId));
    }
  }

  async connect() {
    if (typeof window === 'undefined' || !window.ethereum) {
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

      // Auto-switch to Creditcoin CC3 Testnet (102031 / 0x18e8f) if on another network
      if (this.chainId !== 102031) {
        await this.switchNetwork('0x18e8f');
      }

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
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (switchError) {
      if (
        switchError.code === 4902 ||
        switchError.data?.originalError?.code === 4902 ||
        String(switchError.message).includes('Unrecognized chain') ||
        String(switchError.message).includes('4902')
      ) {
        if (targetChainIdHex === '0x18e8f' || targetChainIdHex === 102031 || targetChainIdHex === '102031') {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x18e8f',
              chainName: 'Creditcoin CC3 Testnet',
              nativeCurrency: { name: 'Creditcoin', symbol: 'tCTC', decimals: 18 },
              rpcUrls: ['https://rpc.cc3-testnet.creditcoin.network'],
              blockExplorerUrls: ['https://creditcoin-testnet.blockscout.com']
            }]
          });
        }
      } else {
        console.warn("Could not auto-switch network:", switchError);
      }
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

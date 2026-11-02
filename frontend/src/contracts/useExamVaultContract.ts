import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import ExamVaultArtifact from '../../../packages/contracts-types/dist/ExamVault.json';
import { useAuth } from '../auth/AuthContext';

const DEFAULT_CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export function useExamVaultContract(): ethers.Contract | null {
  const { account } = useAuth();
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    if (!account || typeof window === 'undefined' || !(window as any).ethereum) {
      setContract(null);
      return;
    }

    let isMounted = true;

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      provider.getSigner().then((signer) => {
        if (!isMounted) return;
        const c = new ethers.Contract(DEFAULT_CONTRACT_ADDRESS, (ExamVaultArtifact as any).abi, signer);
        setContract(c);
      }).catch(() => {
        if (isMounted) setContract(null);
      });
    } catch {
      if (isMounted) setContract(null);
    }

    return () => {
      isMounted = false;
    };
  }, [account]);

  return contract;
}

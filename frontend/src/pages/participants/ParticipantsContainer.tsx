import React, { useState } from 'react';
import {
  useParticipants,
  useRegisterParticipant,
  useRevokeParticipant,
  ParticipantRole,
  ParticipantRegistryContract,
} from '../../hooks/useParticipants';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { ParticipantsView } from './ParticipantsView';

export const ParticipantsContainer: React.FC = () => {
  const guard = useAuthGuard(['ADMIN']);
  const rawContract = useExamVaultContract();
  const contract = rawContract as unknown as ParticipantRegistryContract | null;
  const tx = useTransaction();

  const [roleFilter, setRoleFilter] = useState<ParticipantRole | 'ALL'>('ALL');

  // Hooks from Member 5
  const { participants, isLoading, error, refetch } = useParticipants({ enabled: guard.isAuthorized });
  const registerMutation = useRegisterParticipant({ contract });
  const revokeMutation = useRevokeParticipant({ contract });

  // Handle register participant
  const handleRegister = async (input: { address: string; role: ParticipantRole; profileHash?: string | null }) => {
    try {
      tx.startTx(`Registering participant as ${input.role}`);
      tx.setTxAwaitingSignature();

      const res = await registerMutation.mutate(input);
      // If mutation completes, it was confirmed on chain
      tx.setTxConfirmed(res.address);
      await refetch();
    } catch (err: any) {
      const decoded = decodeContractError(err);
      tx.setTxFailed(decoded.formatted);
      throw err;
    }
  };

  // Handle revoke participant
  const handleRevoke = async (input: { address: string; role: ParticipantRole }) => {
    try {
      tx.startTx(`Revoking ${input.role} role`);
      tx.setTxAwaitingSignature();

      const res = await revokeMutation.mutate(input);
      tx.setTxConfirmed(res.address);
      await refetch();
    } catch (err: any) {
      const decoded = decodeContractError(err);
      tx.setTxFailed(decoded.formatted);
      throw err;
    }
  };

  // If role is denied, show permissionDenied
  const isPermissionDenied = guard.guardState === 'no-role';

  return (
    <ParticipantsView
      participants={participants}
      isLoading={isLoading}
      error={error}
      permissionDenied={isPermissionDenied}
      roleFilter={roleFilter}
      onRoleFilterChange={setRoleFilter}
      onRegister={handleRegister}
      onRevoke={handleRevoke}
      isRegistering={registerMutation.isPending}
      isRevoking={revokeMutation.isPending}
      onRetry={() => refetch()}
    />
  );
};

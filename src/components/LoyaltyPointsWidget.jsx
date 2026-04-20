import { useEffect, useState } from 'react';
import { Gift, TrendingUp, Users, Coins } from 'lucide-react';
import { loyaltyService } from '../services/loyaltyService';
import useModal from '../hooks/useModal';

export default function LoyaltyPointsWidget({ onClose }) {
  const [account, setAccount] = useState(null);
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const { showSuccess, showError, showWarning, ModalComponent } = useModal();

  useEffect(() => {
    loadLoyaltyAccount();
  }, []);

  const loadLoyaltyAccount = async () => {
    try {
      setIsLoading(true);
      const data = await loyaltyService.getLoyaltyAccount();
      setAccount(data.account);
      setConfig(data.config);
    } catch (error) {
      console.error('Error loading loyalty account:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimDaily = async () => {
    try {
      setClaimingBonus(true);
      const result = await loyaltyService.getDailyLoginBonus();

      if (!result.already_claimed) {
        showSuccess('Bonus Claimed', result.message);
        loadLoyaltyAccount();
      } else {
        showWarning('Already Claimed', 'You already claimed your daily bonus today. Come back tomorrow.');
      }
    } catch (error) {
      showError('Claim Failed', `Failed to claim daily bonus: ${error.message}`);
    } finally {
      setClaimingBonus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-blue-200 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-32 rounded bg-blue-100" />
          <div className="h-8 w-8 rounded-full bg-blue-50" />
        </div>
        <div className="rounded-lg border border-blue-100 p-4">
          <div className="h-4 w-24 rounded bg-blue-50" />
          <div className="mt-3 h-10 w-32 rounded bg-blue-100" />
          <div className="mt-3 h-4 w-28 rounded bg-blue-50" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-lg bg-blue-50 p-3">
            <div className="h-5 w-5 rounded bg-blue-100" />
            <div className="mt-3 h-3 w-20 rounded bg-blue-100" />
            <div className="mt-2 h-6 w-16 rounded bg-blue-50" />
          </div>
          <div className="rounded-lg bg-blue-50 p-3">
            <div className="h-5 w-5 rounded bg-blue-100" />
            <div className="mt-3 h-3 w-16 rounded bg-blue-100" />
            <div className="mt-2 h-6 w-14 rounded bg-blue-50" />
          </div>
        </div>
        <div className="mt-4 h-11 rounded-lg bg-blue-100" />
      </div>
    );
  }

  const pointsValue = account
    ? (account.current_points_balance * (config?.points_to_naira_ratio || 1)).toFixed(2)
    : '0.00';

  return (
    <div className="bg-gradient-to-br from-blue-500 to-orange-500 rounded-xl shadow-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 opacity-10">
        <Gift className="w-32 h-32" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2">
            <Coins className="w-6 h-6" />
            Your Points
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-1"
            >
              x
            </button>
          )}
        </div>

        <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mb-4">
          <p className="text-sm opacity-90 mb-1">Current Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold">
              {account?.current_points_balance.toLocaleString() || '0'}
            </span>
            <span className="text-lg">points</span>
          </div>
          <p className="text-sm mt-1 opacity-75">Worth about NGN {pointsValue}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <TrendingUp className="w-5 h-5 mb-1 opacity-75" />
            <p className="text-xs opacity-75">Total Earned</p>
            <p className="text-xl font-bold">
              {account?.total_points_earned.toLocaleString() || '0'}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <Users className="w-5 h-5 mb-1 opacity-75" />
            <p className="text-xs opacity-75">Referrals</p>
            <p className="text-xl font-bold">{account?.total_referrals || '0'}</p>
          </div>
        </div>

        <button
          onClick={handleClaimDaily}
          disabled={claimingBonus}
          className="w-full bg-white text-blue-600 font-bold py-3 px-4 rounded-lg hover:bg-blue-50 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Gift className="w-5 h-5" />
          {claimingBonus ? 'Claiming...' : 'Claim Daily Bonus'}
        </button>

        <div className="mt-4 text-xs opacity-75 text-center">
          <p>Earn points with every purchase!</p>
          {config && (
            <p className="mt-1">{`NGN 100 = ${Math.floor(100 * config.points_per_naira)} points`}</p>
          )}
        </div>
      </div>
      <ModalComponent />
    </div>
  );
}

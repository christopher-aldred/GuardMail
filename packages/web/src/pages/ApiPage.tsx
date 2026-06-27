import { ApiKeySettings } from '../components/ApiKeySettings';
import { KeyIcon } from '../components/Icons';

export function ApiPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
        <KeyIcon size={22} className="text-blue-400" />
        API
      </h1>
      <ApiKeySettings />
    </div>
  );
}
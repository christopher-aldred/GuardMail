import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmailDetail } from '../components/EmailDetail';

export function EmailDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getEmail(id)
      .then((d) => setEmail(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [id]);

  const del = async () => {
    if (!id) return;
    await api.deleteEmail(id);
    navigate(-1);
  };

  const moveToInbox = async () => {
    if (!id) return;
    await api.moveEmailToInbox(id);
    navigate('/app/inbox');
  };

  if (error) return <p className="text-red-400 p-4">{error}</p>;
  if (!email) return <p className="p-4 text-gray-500">Loading…</p>;
  return <EmailDetail email={email} onDelete={del} onMoveToInbox={moveToInbox} />;
}

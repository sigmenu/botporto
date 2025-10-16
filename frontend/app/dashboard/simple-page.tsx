'use client';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Dashboard</h1>
          <p className="text-lg text-green-600 mb-6">Login successful! Welcome to dashboard.</p>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h2 className="font-semibold text-blue-900">User Info</h2>
              <p className="text-blue-700">Check console for user data stored in localStorage</p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg">
              <h2 className="font-semibold text-green-900">Authentication Status</h2>
              <p className="text-green-700">✅ Successfully authenticated and redirected</p>
            </div>
            
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
              }}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
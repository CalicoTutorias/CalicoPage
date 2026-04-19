export default function ProfileLoading() {
  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        {/* Profile Card Skeleton */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-6 sm:p-8">
          {/* Avatar + Info */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-7 w-48 bg-gray-200 rounded-lg animate-pulse" />
              <div className="flex gap-4">
                <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-11 w-36 bg-gray-200 rounded-xl animate-pulse" />
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-6 text-center">
                <div className="h-9 w-16 bg-gray-200 rounded-lg animate-pulse mx-auto mb-2" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mx-auto" />
              </div>
            ))}
          </div>

          {/* About Skeleton */}
          <div className="mb-8">
            <div className="h-6 w-32 bg-gray-200 rounded-lg animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>

          {/* Button Skeleton */}
          <div className="pt-6 border-t border-gray-200">
            <div className="h-12 w-full bg-gray-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

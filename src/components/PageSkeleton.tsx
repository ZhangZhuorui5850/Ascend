export function PageSkeleton() {
  return (
    <div aria-label="正在加载" className="pageStack pageSkeleton" role="status">
      <div className="skeletonLine" />
      <div className="skeletonGrid">
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}

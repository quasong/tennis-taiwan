import ProfilePage from "../../components/ProfilePage";

type UserProfilePageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { userId } = await params;

  return <ProfilePage viewedUserId={userId} />;
}

import { useState } from 'react';
import { FileText, Users, Clock, BarChart3, LogOut, CheckCircle, Settings, Mail, Shield, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { title: 'Rapport du jour', url: '/', icon: FileText },
  { title: 'Créances', url: '/creances', icon: BarChart3 },
  { title: 'Clients', url: '/clients', icon: Users },
  { title: 'Factures réglées', url: '/factures-reglees', icon: CheckCircle },
  { title: 'Historique', url: '/historique', icon: Clock },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, isAdmin } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-5">
          <h1 className={`font-bold text-sidebar-primary ${collapsed ? 'text-xs text-center' : 'text-xl'}`}>
            {collapsed ? 'B' : 'Bramial'}
          </h1>
          {!collapsed && <p className="text-xs text-sidebar-foreground/60 mt-0.5">Recouvrement</p>}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size={collapsed ? 'icon' : 'default'}
              className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 justify-start"
            >
              <Settings className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Admin</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/templates" className="cursor-pointer">
                <Mail className="h-4 w-4 mr-2" /> Templates
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/users" className="cursor-pointer">
                  <Shield className="h-4 w-4 mr-2" /> Utilisateurs
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPasswordOpen(true); }} className="cursor-pointer">
              <KeyRound className="h-4 w-4 mr-2" /> Mon mot de passe
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size={collapsed ? 'icon' : 'default'} onClick={signOut} className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 justify-start">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Déconnexion</span>}
        </Button>
      </SidebarFooter>
      <ChangePasswordModal open={passwordOpen} onOpenChange={setPasswordOpen} />
    </Sidebar>
  );
}

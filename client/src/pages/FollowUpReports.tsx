import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Mail, Phone, CheckCircle, Clock, AlertCircle, TrendingUp } from "lucide-react";

export default function FollowUpReports() {
  const { user } = useAuth();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");

  // Mock data for demonstration
  const campaignData = [
    { id: "1", name: "Q2 SaaS Outreach" },
    { id: "2", name: "Enterprise Sales" },
    { id: "3", name: "Startup Blitz" },
  ];

  const emailSequenceData = [
    { sequence: "Email 1", sent: 50, opened: 32, clicked: 18, calls: 15 },
    { sequence: "Email 2", sent: 50, opened: 28, clicked: 14, calls: 10 },
    { sequence: "Email 3", sent: 50, opened: 22, clicked: 10, calls: 6 },
    { sequence: "Email 4", sent: 50, opened: 18, clicked: 8, calls: 4 },
    { sequence: "Email 5", sent: 50, opened: 15, clicked: 6, calls: 2 },
    { sequence: "Email 6", sent: 50, opened: 12, clicked: 5, calls: 1 },
    { sequence: "Email 7", sent: 50, opened: 10, clicked: 4, calls: 1 },
  ];

  const callFollowUpData = [
    { attempt: "Attempt 1", scheduled: 50, connected: 32, voicemail: 12, failed: 6 },
    { attempt: "Attempt 2", scheduled: 32, connected: 18, voicemail: 8, failed: 6 },
    { attempt: "Attempt 3", scheduled: 18, connected: 10, voicemail: 5, failed: 3 },
    { attempt: "Attempt 4", scheduled: 10, connected: 6, voicemail: 2, failed: 2 },
    { attempt: "Attempt 5", scheduled: 6, connected: 3, voicemail: 2, failed: 1 },
    { attempt: "Attempt 6", scheduled: 3, connected: 2, voicemail: 1, failed: 0 },
    { attempt: "Attempt 7", scheduled: 2, connected: 1, voicemail: 1, failed: 0 },
  ];

  const followUpEmailsTable = [
    { leadName: "John Smith", company: "Tech Corp", sequence: 2, status: "sent", sentDate: "2026-05-27", nextEmail: "2026-06-03" },
    { leadName: "Sarah Johnson", company: "Digital Inc", sequence: 3, status: "opened", sentDate: "2026-05-20", nextEmail: "2026-06-10" },
    { leadName: "Mike Davis", company: "Cloud Systems", sequence: 1, status: "clicked", sentDate: "2026-05-27", nextEmail: "2026-06-03" },
    { leadName: "Emily Brown", company: "AI Solutions", sequence: 4, status: "sent", sentDate: "2026-05-13", nextEmail: "2026-06-17" },
    { leadName: "David Wilson", company: "Data Labs", sequence: 2, status: "sent", sentDate: "2026-05-27", nextEmail: "2026-06-03" },
  ];

  const followUpCallsTable = [
    { leadName: "John Smith", company: "Tech Corp", attempt: 1, status: "connected", duration: "12 min", callDate: "2026-05-27", nextAttempt: "2026-05-28" },
    { leadName: "Sarah Johnson", company: "Digital Inc", attempt: 2, status: "voicemail", duration: "-", callDate: "2026-05-26", nextAttempt: "2026-05-27" },
    { leadName: "Mike Davis", company: "Cloud Systems", attempt: 1, status: "connected", duration: "8 min", callDate: "2026-05-27", nextAttempt: "2026-05-28" },
    { leadName: "Emily Brown", company: "AI Solutions", attempt: 3, status: "failed", duration: "-", callDate: "2026-05-25", nextAttempt: "2026-05-26" },
    { leadName: "David Wilson", company: "Data Labs", attempt: 1, status: "connected", duration: "15 min", callDate: "2026-05-27", nextAttempt: "2026-05-28" },
  ];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      sent: "bg-blue-100 text-blue-800",
      opened: "bg-purple-100 text-purple-800",
      clicked: "bg-green-100 text-green-800",
      connected: "bg-green-100 text-green-800",
      voicemail: "bg-yellow-100 text-yellow-800",
      failed: "bg-red-100 text-red-800",
    };
    return <Badge className={variants[status] || "bg-gray-100 text-gray-800"}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Follow-Up Reports</h1>
        <p className="text-muted-foreground mt-2">Track email sequences and call follow-ups across all campaigns</p>
      </div>

      {/* Campaign Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Choose a campaign..." />
            </SelectTrigger>
            <SelectContent>
              {campaignData.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              Total Emails Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">350</div>
            <p className="text-xs text-muted-foreground mt-1">Across 7 sequences</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Emails Opened
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">137</div>
            <p className="text-xs text-muted-foreground mt-1">39% open rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              Emails Clicked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">63</div>
            <p className="text-xs text-muted-foreground mt-1">18% click rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="w-4 h-4 text-orange-500" />
              Calls Connected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">39</div>
            <p className="text-xs text-muted-foreground mt-1">11% conversion</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Sequence Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Email Sequence Performance</CardTitle>
            <CardDescription>Opens and clicks across 7-email sequence</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={emailSequenceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sequence" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="opened" stroke="#8b5cf6" name="Opened" />
                <Line type="monotone" dataKey="clicked" stroke="#10b981" name="Clicked" />
                <Line type="monotone" dataKey="calls" stroke="#f59e0b" name="Calls" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Call Follow-Up Attempts */}
        <Card>
          <CardHeader>
            <CardTitle>Call Follow-Up Attempts</CardTitle>
            <CardDescription>Success rate across 7 call attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={callFollowUpData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="attempt" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="connected" fill="#10b981" name="Connected" />
                <Bar dataKey="voicemail" fill="#f59e0b" name="Voicemail" />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Detailed Views */}
      <Tabs defaultValue="emails" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="emails">Follow-Up Emails</TabsTrigger>
          <TabsTrigger value="calls">Follow-Up Calls</TabsTrigger>
        </TabsList>

        {/* Follow-Up Emails Table */}
        <TabsContent value="emails">
          <Card>
            <CardHeader>
              <CardTitle>Follow-Up Email Status</CardTitle>
              <CardDescription>Detailed view of all follow-up emails in the sequence</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Sequence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent Date</TableHead>
                      <TableHead>Next Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followUpEmailsTable.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.leadName}</TableCell>
                        <TableCell>{row.company}</TableCell>
                        <TableCell>Email {row.sequence}/7</TableCell>
                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.sentDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.nextEmail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Follow-Up Calls Table */}
        <TabsContent value="calls">
          <Card>
            <CardHeader>
              <CardTitle>Follow-Up Call Status</CardTitle>
              <CardDescription>Detailed view of all follow-up calls in the sequence</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Call Date</TableHead>
                      <TableHead>Next Attempt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followUpCallsTable.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.leadName}</TableCell>
                        <TableCell>{row.company}</TableCell>
                        <TableCell>Attempt {row.attempt}/7</TableCell>
                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                        <TableCell className="text-sm">{row.duration}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.callDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.nextAttempt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
